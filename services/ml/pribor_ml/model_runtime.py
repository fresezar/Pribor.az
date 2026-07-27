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

_CAT_UNKNOWN = "unknown"

ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"


# Beş quantile: kullanıcıya İKİ aralık gösteriliyor.
#   P25–P75 "ehtimal olunan"  — dar, benzer ilanların yarısı içinde
#   P10–P90 "geniş"           — 10 ilandan 8'i içinde
# Ölçüm (185.000 ₼'lik tipik mənzil): dar ±35.000 ₼, geniş ±78.000 ₼. Tek
# aralık göstermek zorunda kalsaydık ya yanıltıcı derecede dar ya da yol
# göstermeyecek kadar geniş olurdu; ikisi birlikte belirsizliğin gerçek
# boyutunu da net bir rakamı da veriyor.
QUANTILE_KEYS: tuple[int, ...] = (10, 25, 50, 75, 90)


@dataclass
class Prediction:
    p10: int
    p25: int
    p50: int
    p75: int
    p90: int
    confidence: float
    shap_top: list[dict[str, Any]]  # [{feature, label, contributionAzn}]
    model_tag: str


class RealEstateModel:
    def __init__(self, models: dict[int, CatBoostRegressor],
                 metadata: dict[str, Any]) -> None:
        self._models = models
        self.metadata = metadata
        # tip → referans SHAP satırı; her istekte yeniden hesaplamamak için
        self._reference_cache: dict[str, np.ndarray | None] = {}

    @property
    def _q50(self) -> CatBoostRegressor:
        return self._models[50]

    @classmethod
    def load(cls, artifacts_dir: Path = ARTIFACTS_DIR) -> "RealEstateModel | None":
        meta_path = artifacts_dir / "metadata.json"
        if not meta_path.exists():
            return None
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            models = {}
            for q in QUANTILE_KEYS:
                m = CatBoostRegressor()
                m.load_model(str(artifacts_dir / f"q{q}.cbm"))
                models[q] = m
            return cls(models, metadata=metadata)
        except Exception as err:
            print(f"⚠ Model artifact yüklenemedi ({err}) — heuristik stub'a düşülüyor")
            return None

    def _reference_row(self, record: dict[str, Any]) -> np.ndarray | None:
        """Aynı emlak tipinin tipik kaydı için SHAP katkıları (önbellekli).

        Referans kayıtlar eğitimde hesaplanıp metadata'ya yazılır
        (train.py `reference_records`). Yoksa None döner ve katkılar ham
        SHAP olarak gösterilir — eski artifact'lerle uyumluluk için.
        """
        ptype = str(record.get("property_type") or "")
        if ptype in self._reference_cache:
            return self._reference_cache[ptype]
        ref = (self.metadata.get("reference_records") or {}).get(ptype)
        if ref is None:
            self._reference_cache[ptype] = None
            return None
        pool = Pool(build_frame([ref]), cat_features=CAT_FEATURES)
        row = self._q50.get_feature_importance(data=pool, type="ShapValues")[0][:-1]
        self._reference_cache[ptype] = row
        return row

    def predict(self, record: dict[str, Any]) -> Prediction:
        """record: features.build_frame'in beklediği snake_case sözlük."""
        frame = build_frame([record])
        pool = Pool(frame, cat_features=CAT_FEATURES)

        raw = np.array([float(self._models[q].predict(pool)[0]) for q in QUANTILE_KEYS])
        # Quantile crossing düzeltmesi: bağımsız modeller nadiren sıra bozar
        p10, p25, p50, p75, p90 = (
            max(0, int(round(v, -2))) for v in np.sort(raw)
        )

        # Güven skoru: aralık genişliği daralınca artar (0.30–0.95 bandı).
        # Gerçek comps yoğunluğu sinyali Faz 1'de eklenecek.
        rel_width = (p90 - p10) / max(p50, 1)
        confidence = float(np.clip(1.0 - rel_width * 1.4, 0.30, 0.95))

        # SHAP — P50 modelinden native ShapValues: son sütun baz değerdir
        shap_row = self._q50.get_feature_importance(data=pool, type="ShapValues")[0]
        contributions = shap_row[:-1]
        feature_names = list(frame.columns)

        # SHAP'ın kendi referansı EĞİTİM SETİNİN ORTALAMASIDIR — içinde torpaq
        # da var ve torpağın sahəsi 700 m²'den başlıyor. Bu yüzden 100 m²'lik
        # bir mənzil "küçük" sayılıp "Sahə −43.717 ₼" gibi kullanıcıya saçma
        # görünen bir satır çıkıyordu.
        #
        # Doğru soru "bu ev veri setinin ortalamasından ne kadar farklı" değil,
        # "AYNI TİPTE TİPİK BİR EMLAKTAN ne kadar farklı". Bu yüzden katkıları
        # aynı tipin referans kaydına göre farkla gösteriyoruz: kullanıcı
        # "150 m² olduğu için +X" okur, karşılaştırma da anlamlı olur.
        reference = self._reference_row(record)
        if reference is not None:
            contributions = contributions - reference
        # Kullanıcının GİRMEDİĞİ feature'ları (NaN sayısal / 'unknown' kategorik)
        # DNT'den ele: mənzil için "Torpaq sahəsi" gibi ilgisiz satırlar çıkmasın.
        row = frame.iloc[0]
        provided = {
            name for name in feature_names
            if not (isinstance(row[name], float) and np.isnan(row[name]))
            and str(row[name]) != _CAT_UNKNOWN
        }
        order = np.argsort(-np.abs(contributions))
        shap_top = [
            {
                "feature": feature_names[i],
                "label": LABELS_AZ.get(feature_names[i], feature_names[i]),
                "contributionAzn": round(float(contributions[i])),
            }
            for i in order[:10]
            if feature_names[i] in provided
            and abs(contributions[i]) >= 1.0  # ~0 katkılar gürültüdür, listeyi kirletmesin
        ][:8]

        return Prediction(
            p10=p10, p25=p25, p50=p50, p75=p75, p90=p90,
            confidence=round(confidence, 3),
            shap_top=shap_top,
            model_tag=str(self.metadata.get("tag", "unknown")),
        )
