"""Ham otomotiv payload'ı → NormalizedVehicle."""

from __future__ import annotations

import re
from typing import Any

from ..models import NormalizedVehicle, RawListing
from . import dictionaries as d

# Marka takma adları — RU yazımlar ve halk ağzı kanonik ada eşlenir
MAKE_ALIASES: dict[str, tuple[str, ...]] = {
    "Mercedes-Benz": ("mercedes", "мерседес", "mers"),
    "BMW": ("bmw", "бмв"),
    "Toyota": ("toyota", "тойота"),
    "Hyundai": ("hyundai", "хендай", "хундай"),
    "Kia": ("kia", "киа"),
    "LADA (VAZ)": ("lada", "vaz", "ваз", "лада"),
    "Chevrolet": ("chevrolet", "шевроле"),
    "Nissan": ("nissan", "ниссан"),
    "Ford": ("ford", "форд"),
    "Volkswagen": ("volkswagen", "vw", "фольксваген"),
    "Opel": ("opel", "опель"),
    "Changan": ("changan", "чанган"),
    "BYD": ("byd",),
    "Khazar": ("khazar", "xəzər avto"),  # yerli üretim (NAZ Khazar)
}

FUEL_MAP: dict[str, tuple[str, ...]] = {
    "petrol": ("benzin", "бензин"),
    "diesel": ("dizel", "дизель"),
    "gas": ("qaz", "газ", "lpg"),
    "hybrid": ("hibrid", "гибрид"),
    "electric": ("elektro", "elektrik", "электро"),
}

TRANSMISSION_MAP: dict[str, tuple[str, ...]] = {
    "automatic": ("avtomat", "автомат"),
    "manual": ("mexaniki", "механика", "mexanika"),
    "robot": ("robot", "робот"),
    "variator": ("variator", "вариатор"),
}

_YEAR_RE = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
_ENGINE_RE = re.compile(r"(\d\.\d)\s*l", re.IGNORECASE)


def _match_map(text: str, mapping: dict[str, tuple[str, ...]]) -> str | None:
    t = d.az_lower(text)
    for canonical, aliases in mapping.items():
        if any(a in t for a in aliases):
            return canonical
    return None


def normalize_vehicle(raw: RawListing) -> NormalizedVehicle:
    p: dict[str, Any] = raw.payload
    props: dict[str, str] = p.get("props", {}) or {}
    title: str = p.get("title", "") or ""
    haystack = " · ".join([title, p.get("description", "") or "", *props.values()])

    out = NormalizedVehicle(
        source_site=raw.source_site,
        source_ext_id=raw.source_ext_id,
        raw_title=title or None,
    )
    warn = out.parse_warnings.append

    if price := d.parse_price(p.get("price_text", "") or ""):
        amount, currency = price
        out.price_currency_raw = currency
        out.price_azn = amount if currency == "AZN" else None
        if currency == "USD":
            warn("price_in_usd: günlük kurla çevrim gerekiyor")
    else:
        warn("price_unparsed")

    # Marka önce başlıktan (en güvenilir), model markadan sonraki kelime(ler)den
    out.make = _match_map(title, MAKE_ALIASES) or _match_map(haystack, MAKE_ALIASES)
    if out.make is None:
        warn("make_unparsed")
    elif title:
        # "Mercedes E 220 d 2016" → make sonrası, yıl öncesi kısım model kabul edilir
        t = d.az_lower(title)
        alias_hit = next((a for a in MAKE_ALIASES[out.make] if a in t), None)
        if alias_hit:
            rest = t.split(alias_hit, 1)[1]
            rest = _YEAR_RE.split(rest)[0]
            model = rest.strip(" ,·-").strip()
            out.model = model[:60] or None

    if m := _YEAR_RE.search(haystack):
        out.year = int(m.group(1))
    else:
        warn("year_unparsed")

    out.mileage_km = d.parse_mileage_km(haystack)
    if em := _ENGINE_RE.search(haystack):
        out.engine_l = float(em.group(1))

    out.fuel_type = _match_map(haystack, FUEL_MAP)
    out.transmission = _match_map(haystack, TRANSMISSION_MAP)
    out.accident_free = d.parse_accident_free(haystack)
    out.customs_cleared = d.parse_customs(haystack)
    out.contact_phone = d.parse_phone(p.get("phone_text") or haystack)

    return out
