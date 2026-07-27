"""Veri modelleri: ham kayıt (immutable) ve normalize çıktılar (staging)."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RawListing(BaseModel):
    """Scraper'ın tek çıktı birimi — JSONL'in bir satırı.

    `payload` kaynak sayfadan çıkarılan alanların OLDUĞU GİBİ halidir:
    süzme, çeviri, tip dönüşümü YOK. Temizleme ayrı aşamadır (pipeline.py) —
    böylece normalizasyon mantığı değişince tarih yeniden işlenebilir.
    """

    source_site: str
    source_ext_id: str
    url: str
    fetched_at: datetime = Field(default_factory=utcnow)
    http_status: int = 200
    vertical_hint: Literal["real_estate", "vehicle"] | None = None
    payload: dict[str, Any]

    @property
    def content_hash(self) -> str:
        """Payload'ın deterministik SHA-256'sı — değişim tespiti + dedup."""
        blob = json.dumps(self.payload, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    def to_jsonl_line(self) -> str:
        doc = self.model_dump(mode="json")
        doc["content_hash"] = self.content_hash
        return json.dumps(doc, ensure_ascii=False)


class NormalizedRealEstate(BaseModel):
    """Temizleme hattının gayrimenkul çıktısı — scraped_listings.normalized şekli."""

    source_site: str
    source_ext_id: str
    vertical: Literal["real_estate"] = "real_estate"

    property_type: str | None = None       # apartment | house | land | ...
    # sale | rent — kiralık ilan satılık fiyat modeline GİRMEMELİDİR (kira
    # medyanı 550 AZN, satış medyanı 140.000 AZN). Kaynakta filtreleniyor;
    # bu alan ikinci savunma hattı ve eski verinin yeniden işlenmesi içindir.
    listing_kind: str | None = None
    district: str | None = None            # kanonik rayon adı
    settlement: str | None = None
    metro_station: str | None = None       # metinden yakalanan istasyon (geocode değil)
    price_azn: int | None = None
    price_currency_raw: str | None = None  # kaynakta AZN mi USD mi yazıyordu
    area_m2: float | None = None
    land_area_sot: float | None = None
    rooms: int | None = None
    floor: int | None = None
    total_floors: int | None = None
    building_type: str | None = None       # yeni_tikili | kohne_tikili | stalinka
    repair_state: int | None = None        # 0..5 ordinal
    title_deed: bool | None = None         # kupça
    mortgage_eligible: bool | None = None
    # Torpağın təyinatı — arsa fiyatını ayıran en güçlü ikinci sinyal
    # (kommersiya ₼/sot medyanı kənd təsərrüfatının 6 katı). Bkz. dictionaries.
    land_use: str | None = None

    contact_phone: str | None = None
    raw_title: str | None = None
    parse_warnings: list[str] = Field(default_factory=list)


class NormalizedVehicle(BaseModel):
    """Temizleme hattının otomotiv çıktısı."""

    source_site: str
    source_ext_id: str
    vertical: Literal["vehicle"] = "vehicle"

    make: str | None = None
    model: str | None = None
    year: int | None = None
    mileage_km: int | None = None
    engine_l: float | None = None
    fuel_type: str | None = None
    transmission: str | None = None
    price_azn: int | None = None
    price_currency_raw: str | None = None
    accident_free: bool | None = None
    customs_cleared: bool | None = None

    contact_phone: str | None = None
    raw_title: str | None = None
    parse_warnings: list[str] = Field(default_factory=list)
