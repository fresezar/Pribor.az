"""Gayrimenkul feature sözleşmesi — eğitim (train.py) ve servis (model_runtime.py)
AYNI tanımı kullanır; sıra/tip kayması modelin sessizce saçmalamasına yol açar,
o yüzden tek doğruluk kaynağı bu dosyadır.

Kaynak kayıt şekli: scraped_listings.normalized (NormalizedRealEstate) veya
API girdisi (contracts.RealEstateValuationInput'un snake_case izdüşümü).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# Model girdi sırası — ASLA yeniden sıralama; yeni feature sona eklenir.
# Not: feature seti değişince model YENİDEN eğitilmeli (kayıtlı .cbm feature
# sayısına bağlıdır) — bkz. train.py.
FEATURE_ORDER: list[str] = [
    "district",        # kategorik
    "property_type",   # kategorik: apartment | house | land
    "building_type",   # kategorik (apartment'a özgü)
    "area_m2",         # sayısal — ana sahə (mənzil/tikili; land'de sahə)
    "land_area_sot",   # sayısal — torpaq sahəsi (house/land), apartment'ta NaN
    "rooms",           # sayısal
    "floor",           # sayısal
    "total_floors",    # sayısal
    "repair_state",    # sıralı 0..5
    "title_deed",      # 0/1/NaN
    "metro_dist_m",    # sayısal
]

CAT_FEATURES: list[str] = ["district", "property_type", "building_type"]

# SHAP çıktısını kullanıcı diline çeviren etiketler (AZ) — "Qiymət DNT-si"
LABELS_AZ: dict[str, str] = {
    "district": "Rayon",
    "property_type": "Əmlak növü",
    "building_type": "Bina tipi",
    "area_m2": "Sahə",
    "land_area_sot": "Torpaq sahəsi",
    "rooms": "Otaq sayı",
    "floor": "Mərtəbə",
    "total_floors": "Binanın mərtəbə sayı",
    "repair_state": "Təmir vəziyyəti",
    "title_deed": "Kupça",
    "metro_dist_m": "Metro yaxınlığı",
}

_CAT_UNKNOWN = "unknown"


def _to_float(v: Any) -> float:
    if v is None:
        return np.nan
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return np.nan


def build_frame(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Ham kayıt listesinden model-hazır DataFrame üretir.

    Kategorikler: eksik → 'unknown' (CatBoost kategorikte NaN kabul etmez).
    Sayısallar: eksik → NaN (CatBoost native işler).
    """
    rows: list[dict[str, Any]] = []
    for r in records:
        rows.append({
            "district": str(r.get("district") or _CAT_UNKNOWN),
            "property_type": str(r.get("property_type") or _CAT_UNKNOWN),
            "building_type": str(r.get("building_type") or _CAT_UNKNOWN),
            "area_m2": _to_float(r.get("area_m2")),
            "land_area_sot": _to_float(r.get("land_area_sot")),
            "rooms": _to_float(r.get("rooms")),
            "floor": _to_float(r.get("floor")),
            "total_floors": _to_float(r.get("total_floors")),
            "repair_state": _to_float(r.get("repair_state")),
            "title_deed": _to_float(r.get("title_deed")),
            "metro_dist_m": _to_float(r.get("metro_dist_m")),
        })
    return pd.DataFrame(rows, columns=FEATURE_ORDER)
