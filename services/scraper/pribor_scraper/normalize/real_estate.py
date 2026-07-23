"""Ham gayrimenkul payload'ı → NormalizedRealEstate.

Strateji: başlık + açıklama + özellik tablosu tek metin havuzunda taranır;
yapılandırılmış alan (props) varsa o ÖNCELİKLİDİR — serbest metin yalnızca
boşlukları doldurur. Ayrıştırılamayan her alan parse_warnings'e not düşer:
uyarı oranı, sözlüğün nerede zayıf kaldığını gösteren metriktir.
"""

from __future__ import annotations

from typing import Any

from ..models import NormalizedRealEstate, RawListing
from . import dictionaries as d

# Kaynak sitelerin özellik tablosu anahtarları → bakılacak alan
# ("Sahə" AZ, "Площадь" RU vb. — yeni kaynak eklendikçe genişler)
PROP_KEYS_AREA = ("sahə", "sahe", "площадь", "ümumi sahə")
PROP_KEYS_ROOMS = ("otaq sayı", "otaq sayi", "otaqların sayı", "комнат")
PROP_KEYS_FLOOR = ("mərtəbə", "mertebe", "этаж")
PROP_KEYS_CATEGORY = ("kateqoriya", "əmlakın növü", "категория", "тип")

CATEGORY_MAP: dict[str, tuple[str, ...]] = {
    "apartment": ("mənzil", "menzil", "квартира"),
    "house": ("ev", "villa", "bağ evi", "bag evi", "həyət evi", "дом", "дача"),
    "land": ("torpaq", "участок", "torpaq sahəsi"),
    "commercial": ("obyekt", "ticarət", "коммерческая", "объект"),
    "office": ("ofis", "офис"),
    "garage": ("qaraj", "гараж"),
}


def _prop(props: dict[str, str], keys: tuple[str, ...]) -> str | None:
    for raw_key, value in props.items():
        if any(k in d.az_lower(raw_key) for k in keys):
            return value
    return None


def normalize_real_estate(raw: RawListing) -> NormalizedRealEstate:
    p: dict[str, Any] = raw.payload
    props: dict[str, str] = p.get("props", {}) or {}
    title: str = p.get("title", "") or ""
    desc: str = p.get("description", "") or ""
    # breadcrumb'lar kategori/rayon sinyali taşır
    haystack = " · ".join([title, desc, *props.values(), *(p.get("breadcrumbs") or [])])

    out = NormalizedRealEstate(
        source_site=raw.source_site,
        source_ext_id=raw.source_ext_id,
        raw_title=title or None,
    )
    warn = out.parse_warnings.append

    # --- fiyat ---
    if price := d.parse_price(p.get("price_text", "") or ""):
        amount, currency = price
        out.price_currency_raw = currency
        # USD ilanlar işaretlenir; AZN çevrimi günlük kurla işleme katmanında
        out.price_azn = amount if currency == "AZN" else None
        if currency == "USD":
            warn("price_in_usd: günlük kurla çevrim gerekiyor")
    else:
        warn("price_unparsed")

    # --- kategori ---
    cat_text = _prop(props, PROP_KEYS_CATEGORY) or haystack
    t = d.az_lower(cat_text)
    for canonical, needles in CATEGORY_MAP.items():
        if any(n in t for n in needles):
            out.property_type = canonical
            break
    if out.property_type is None:
        warn("property_type_unparsed")

    # --- alan / oda / kat: önce yapılandırılmış alan, sonra serbest metin ---
    out.area_m2 = d.parse_area_m2(_prop(props, PROP_KEYS_AREA) or haystack)
    out.land_area_sot = d.parse_area_sot(haystack)
    out.rooms = d.parse_rooms(_prop(props, PROP_KEYS_ROOMS) or haystack)
    if floor := d.parse_floor(_prop(props, PROP_KEYS_FLOOR) or haystack):
        out.floor, out.total_floors = floor

    # --- Bakü'ye özgü sözlük alanları ---
    out.building_type = d.parse_building_type(haystack)
    out.repair_state = d.parse_repair_state(haystack)
    out.title_deed = d.parse_title_deed(haystack)
    out.mortgage_eligible = d.parse_mortgage(haystack)
    out.district = d.parse_district(haystack)
    out.metro_station = d.parse_metro(haystack)
    out.contact_phone = d.parse_phone(p.get("phone_text") or haystack)

    if out.area_m2 is None and out.land_area_sot is None:
        warn("area_unparsed")
    if out.district is None:
        warn("district_unparsed")

    return out
