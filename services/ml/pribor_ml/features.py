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
    # --- qəsəbə kırılımı (rayon içi fiyat uçurumu) ---
    # Aynı rayonda qəsəbələr arası fark iki katı bulabiliyor (Xəzər:
    # Mərdəkan/Şüvəlan ↔ Türkan/Zirə). Rayon tek başına bunu açıklayamaz.
    "settlement",      # kategorik — modelin esas öğrendiği yer sinyali
    # Aşağıdaki üçü qəsəbənin coğrafi profilidir (scraper/normalize/settlements.py).
    # Amaçları AZ ÖRNEKLİ qəsəbələrde tahmini toparlamak: model o qəsəbəni
    # tanımıyorsa bile "merkeze 30 km, denize 1 km, villa bölgesi" bilgisi
    # onu benzer qəsəbələrin seviyesine oturtur (cold start).
    "center_km",       # sayısal — şəhər mərkəzinə təxmini məsafə
    "sea_km",          # sayısal — dənizə təxmini məsafə
    "area_character",  # kategorik — central|residential|suburb|villa_coast|industrial|rural
    # Torpağın təyinatı — aynı yerdeki iki arsayı ayıran ana etken. Ölçülen
    # ₼/sot medyanı: kommersiya 30.159 ↔ kənd təsərrüfatı 5.000 (6 kat).
    # Mənzildə boştur (unknown) — model tipe göre zaten ayrışıyor.
    "land_use",        # kategorik — kommersiya|tikinti|yasayis|bag|kend_teserrufati
]

CAT_FEATURES: list[str] = [
    "district", "property_type", "building_type", "settlement", "area_character",
    "land_use",
]

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
    "settlement": "Qəsəbə",
    "center_km": "Mərkəzə məsafə",
    "sea_km": "Dənizə yaxınlıq",
    "area_character": "Ərazinin xarakteri",
    "land_use": "Torpağın təyinatı",
}

_CAT_UNKNOWN = "unknown"

# Qəsəbə profil tablosu (scripts/sync_settlements.py ile üretilir).
try:
    from .settlements_data import ALIASES as _ALIASES
    from .settlements_data import SETTLEMENT_PROFILES as _PROFILES
except ImportError:  # tablo yoksa qəsəbə sinyalleri boş kalır, model yine çalışır
    _PROFILES, _ALIASES = {}, {}

_PROFILE_INDEX: dict[str, tuple[str, float, float, str]] = {}
for _n, _p in _PROFILES.items():
    _PROFILE_INDEX[_n.lower().replace("ı", "i").replace("İ", "i")] = _p
for _a, _t in _ALIASES.items():
    if _t in _PROFILES:
        _PROFILE_INDEX[_a.lower().replace("ı", "i").replace("İ", "i")] = _PROFILES[_t]


def settlement_profile(name: str | None) -> tuple[float, float, str] | None:
    """Qəsəbə adı → (mərkəzə km, dənizə km, xarakter). Tanınmazsa None.

    Eğitim ve servis aynı fonksiyonu kullanır — böylece bir kaydın coğrafi
    sinyalleri nerede hesaplanırsa hesaplansın aynı çıkar.
    """
    if not name:
        return None
    p = _PROFILE_INDEX.get(name.strip().lower().replace("ı", "i").replace("İ", "i"))
    return (p[1], p[2], p[3]) if p else None


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

    Qəsəbə coğrafi alanları (center_km/sea_km/area_character) kayıtta yoksa
    qəsəbə adından türetilir — böylece hem eğitim (scraped_listings) hem servis
    (API girdisi) aynı değerleri üretir; kayması modelin sessizce saçmalamasına
    yol açardı.
    """
    rows: list[dict[str, Any]] = []
    for r in records:
        settlement = r.get("settlement") or None
        prof = settlement_profile(settlement) if settlement else None
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
            "settlement": str(settlement or _CAT_UNKNOWN),
            "center_km": _to_float(r.get("center_km") if r.get("center_km") is not None
                                   else (prof[0] if prof else None)),
            "sea_km": _to_float(r.get("sea_km") if r.get("sea_km") is not None
                                else (prof[1] if prof else None)),
            "area_character": str(r.get("area_character")
                                  or (prof[2] if prof else None) or _CAT_UNKNOWN),
            "land_use": str(r.get("land_use") or _CAT_UNKNOWN),
        })
    return pd.DataFrame(rows, columns=FEATURE_ORDER)
