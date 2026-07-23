"""Eğitilmiş CatBoost artifact'lerini yükleyip tahmin + SHAP üreten runtime.

main.py açılışta `RealEstateModel.load()` dener: artifact varsa gerçek model,
yoksa None döner ve servis heuristik stub'a düşer — böylece API sözleşmesi
model olsun olmasın hep aynıdır.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from catboost import CatBoostRegressor, Pool

from .features import CAT_FEATURES, LABELS_AZ, build_frame

ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"


@dataclass
class Prediction:
    p10: int
    p50: int
    p90: int
    confidence: float
    shap_top: list[dict[str, Any]]  # [{feature, label, contributionAzn}]
    model_tag: str


class RealEstateModel:
    def __init__(self, q10: CatBoostRegressor, q50: CatBoostRegressor,
                 q90: CatBoostRegressor, metadata: dict[str, Any]) -> None:
        self._q10, self._q50, self._q90 = q10, q50, q90
        self.metadata = metadata

    @classmethod
    def load(cls, artifacts_dir: Path = ARTIFACTS_DIR) -> "RealEstateModel | None":
        meta_path = artifacts_dir / "metadata.json"
        if not meta_path.exists():
            return None
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            models = []
            for q in (10, 50, 90):
                m = CatBoostRegressor()
                m.load_model(str(artifacts_dir / f"q{q}.cbm"))
                models.append(m)
            return cls(*models, metadata=metadata)
        except Exception as err:
            print(f"⚠ Model artifact yüklenemedi ({err}) — heuristik stub'a düşülüyor")
            return None

    def predict(self, record: dict[str, Any]) -> Prediction:
        """record: features.build_frame'in beklediği snake_case sözlük."""
        frame = build_frame([record])
        pool = Pool(frame, cat_features=CAT_FEATURES)

        raw = np.array([
            float(self._q10.predict(pool)[0]),
            float(self._q50.predict(pool)[0]),
            float(self._q90.predict(pool)[0]),
        ])
        # Quantile crossing düzeltmesi: bağımsız modeller nadiren sıra bozar
        p10, p50, p90 = np.sort(raw)
        p10, p50, p90 = (max(0, int(round(v, -2))) for v in (p10, p50, p90))

        # Güven skoru: aralık genişliği daralınca artar (0.30–0.95 bandı).
        # Gerçek comps yoğunluğu sinyali Faz 1'de eklenecek.
        rel_width = (p90 - p10) / max(p50, 1)
        confidence = float(np.clip(1.0 - rel_width * 1.4, 0.30, 0.95))

        # SHAP — P50 modelinden native ShapValues: son sütun baz değerdir
        shap_row = self._q50.get_feature_importance(data=pool, type="ShapValues")[0]
        contributions = shap_row[:-1]
        feature_names = list(frame.columns)
        order = np.argsort(-np.abs(contributions))
        shap_top = [
            {
                "feature": feature_names[i],
                "label": LABELS_AZ.get(feature_names[i], feature_names[i]),
                "contributionAzn": round(float(contributions[i])),
            }
            for i in order[:8]
            if abs(contributions[i]) >= 1.0  # ~0 katkılar gürültüdür, listeyi kirletmesin
        ]

        return Prediction(
            p10=p10, p50=p50, p90=p90,
            confidence=round(confidence, 3),
            shap_top=shap_top,
            model_tag=str(self.metadata.get("tag", "unknown")),
        )
