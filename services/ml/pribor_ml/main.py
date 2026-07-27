"""
Pribor Valuation API — Faz 0 stub'ı.

Sözleşme @pribor/contracts/src/valuation.ts (ValuationResult) ile birebirdir;
NestJS yanıtı Zod ile doğrular, bu yüzden alan adları camelCase'dir.

Faz 0 sonunda bu stub'ın yerini alacaklar:
  - MLflow registry'den production CatBoost quantile modeli yükleme
  - SHAP TreeExplainer ile gerçek katkı hesabı
  - PostGIS'ten kNN comps sorgusu
Şimdilik: semt bazlı m² tablosuyla deterministik, makul bir taban tahmin —
uçtan uca akışın (web → NestJS → ML) ilk günden test edilebilmesi için.
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from typing import Literal, Union

# Windows konsolu cp1252 açılabilir — Türkçe/AZ karakterler için UTF-8'e zorla
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Pribor Valuation API", version="0.1.0")

MODEL_VERSION = "re-baseline-heuristic-0.0.1"

# Eğitilmiş CatBoost artifact'i varsa yükle (yoksa/catboost kurulu değilse stub)
try:
    from .model_runtime import RealEstateModel

    RE_MODEL = RealEstateModel.load()
except ImportError:
    RE_MODEL = None
if RE_MODEL is not None:
    print(f"✔ CatBoost modeli yüklendi: {RE_MODEL.metadata.get('tag')}")
else:
    print("ℹ Model artifact yok — heuristik stub servis ediliyor "
          "(eğitim: python -m pribor_ml.train --synthetic)")

# Kaba taban değerler (₼/m², 2026 ortası) — yalnızca stub; gerçek değerler modelden gelecek
DISTRICT_SQM_AZN: dict[str, int] = {
    "Nərimanov": 2600,
    "Nəsimi": 2500,
    "Səbail": 3100,
    "Yasamal": 2300,
    "Xətai": 2000,
    "Nizami": 1850,
    "Binəqədi": 1600,
    "Sabunçu": 1300,
    "Suraxanı": 1200,
    "Xəzər": 1250,
    "Qaradağ": 1000,
    "Pirallahı": 900,
    "Abşeron": 1100,
}


class RealEstateInput(BaseModel):
    vertical: Literal["real_estate"]
    propertyType: str
    district: str
    # Qəsəbə: rayon içi fiyat farkını açıklayan ana sinyal (bkz. contracts).
    # Modelin coğrafi profil alanları (center_km/sea_km/area_character) bundan
    # türetilir — gönderilmezse o sinyaller boş kalır ve tahmin rayon
    # ortalamasına yaklaşır.
    settlement: str | None = None
    metroStation: str | None = None
    areaM2: float = Field(gt=0)
    landAreaSot: float | None = None
    rooms: int | None = None
    floor: int | None = None
    totalFloors: int | None = None
    buildingType: str | None = None
    repairState: int | None = Field(default=None, ge=0, le=5)
    titleDeed: bool | None = None
    metroDistM: int | None = None
    lat: float | None = None
    lng: float | None = None


class VehicleInput(BaseModel):
    vertical: Literal["vehicle"]
    make: str
    model: str
    year: int
    mileageKm: int = Field(ge=0)
    engineL: float | None = None
    fuelType: str | None = None
    transmission: str | None = None
    accidentFree: bool | None = None
    customsCleared: bool | None = None


class CreateValuationDto(BaseModel):
    input: Union[RealEstateInput, VehicleInput] = Field(discriminator="vertical")
    channel: str = "web"


class ShapContribution(BaseModel):
    feature: str
    label: str
    contributionAzn: float


class ValuationResult(BaseModel):
    valuationId: str
    vertical: str
    # İki aralık: P25–P75 "ehtimal olunan" (dar), P10–P90 "geniş".
    # Gerekçe ve ölçülen kapsama için bkz. contracts/src/valuation.ts.
    p10Azn: int
    p25Azn: int
    p50Azn: int
    p75Azn: int
    p90Azn: int
    confidence: float
    shapTop: list[ShapContribution]
    compListingIds: list[str]
    modelVersion: str
    createdAt: str


def _now_iso() -> str:
    # Zod z.string().datetime() varsayılanı yalnızca 'Z' soneki kabul eder
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _predict_real_estate_catboost(inp: RealEstateInput) -> ValuationResult:
    """Eğitilmiş quantile modelleriyle tahmin + gerçek SHAP katkıları."""
    assert RE_MODEL is not None
    pred = RE_MODEL.predict({
        "district": inp.district,
        "settlement": inp.settlement,
        "metro_station": inp.metroStation,
        "property_type": inp.propertyType,
        "building_type": inp.buildingType,
        "area_m2": inp.areaM2,
        "land_area_sot": inp.landAreaSot,
        "rooms": inp.rooms,
        "floor": inp.floor,
        "total_floors": inp.totalFloors,
        "repair_state": inp.repairState,
        "title_deed": inp.titleDeed,
        "metro_dist_m": inp.metroDistM,
    })
    return ValuationResult(
        valuationId=str(uuid.uuid4()),
        vertical="real_estate",
        p10Azn=pred.p10,
        p25Azn=pred.p25,
        p50Azn=pred.p50,
        p75Azn=pred.p75,
        p90Azn=pred.p90,
        confidence=pred.confidence,
        shapTop=[ShapContribution(**s) for s in pred.shap_top],
        compListingIds=[],  # Faz 1: PostGIS kNN comps sorgusu buraya bağlanır
        modelVersion=pred.model_tag,
        createdAt=_now_iso(),
    )


def _estimate_real_estate(inp: RealEstateInput) -> ValuationResult:
    base_sqm = DISTRICT_SQM_AZN.get(inp.district, 1500)
    shap: list[ShapContribution] = []

    # Torpaq (arsa): ham arazi ₼/m², otaq/təmir/bina yok — yalnızca sahə/konum/kupça
    if inp.propertyType == "land":
        price = base_sqm * 0.28 * inp.areaM2
        if inp.metroDistM is not None and inp.metroDistM < 1500:
            delta = 0.08 * price
            price += delta
            shap.append(ShapContribution(
                feature="metro_dist_m", label="Metro yaxınlığı", contributionAzn=round(delta)))
        if inp.titleDeed is False:
            delta = -0.20 * price
            price += delta
            shap.append(ShapContribution(
                feature="title_deed", label="Kupça yoxdur", contributionAzn=round(delta)))
        p50 = int(round(price, -2))
        return ValuationResult(
            valuationId=str(uuid.uuid4()), vertical="real_estate",
            p10Azn=int(p50 * 0.88), p25Azn=int(p50 * 0.94), p50Azn=p50,
            p75Azn=int(p50 * 1.07), p90Azn=int(p50 * 1.14),
            confidence=0.4, shapTop=sorted(shap, key=lambda s: -abs(s.contributionAzn))[:8],
            compListingIds=[], modelVersion=MODEL_VERSION, createdAt=_now_iso())

    # apartment | house: tikili sahəsi üzerinden (ev ₼/m² biraz düşük)
    sqm = base_sqm * (0.85 if inp.propertyType == "house" else 1.0)
    price = sqm * inp.areaM2
    if inp.propertyType == "house" and inp.landAreaSot:
        land_delta = base_sqm * 0.28 * (inp.landAreaSot * 100)
        price += land_delta
        shap.append(ShapContribution(
            feature="land_area_sot", label="Torpaq sahəsi", contributionAzn=round(land_delta)))

    if inp.repairState is not None:
        # 3 (orta) nötr kabul; her basamak ±%6
        delta = (inp.repairState - 3) * 0.06 * price
        price += delta
        shap.append(ShapContribution(
            feature="repair_state", label="Təmir vəziyyəti", contributionAzn=round(delta)))

    if inp.metroDistM is not None and inp.metroDistM < 800:
        delta = 0.07 * price
        price += delta
        shap.append(ShapContribution(
            feature="metro_dist_m", label="Metro yaxınlığı", contributionAzn=round(delta)))

    if inp.buildingType == "yeni_tikili":
        delta = 0.05 * price
        price += delta
        shap.append(ShapContribution(
            feature="building_type", label="Yeni tikili", contributionAzn=round(delta)))

    if inp.titleDeed is False:
        delta = -0.12 * price
        price += delta
        shap.append(ShapContribution(
            feature="title_deed", label="Kupça yoxdur", contributionAzn=round(delta)))

    p50 = int(round(price, -2))
    return ValuationResult(
        valuationId=str(uuid.uuid4()),
        vertical="real_estate",
        p10Azn=int(p50 * 0.94),
        p25Azn=int(p50 * 0.97),
        p50Azn=p50,
        p75Azn=int(p50 * 1.03),
        p90Azn=int(p50 * 1.06),
        confidence=0.5,  # stub — gerçek skor comps yoğunluğundan gelecek
        shapTop=sorted(shap, key=lambda s: -abs(s.contributionAzn))[:8],
        compListingIds=[],
        modelVersion=MODEL_VERSION,
        createdAt=_now_iso(),
    )


def _estimate_vehicle(inp: VehicleInput) -> ValuationResult:
    # Çok kaba stub: yaş ve km amortismanı ile taban değer
    base = 45_000
    age = max(0, 2026 - inp.year)
    price = base * (0.90**age)
    shap: list[ShapContribution] = [
        ShapContribution(feature="year", label="Buraxılış ili",
                         contributionAzn=round(price - base)),
    ]
    km_delta = -0.02 * price * (inp.mileageKm / 50_000)
    price += km_delta
    shap.append(ShapContribution(feature="mileage_km", label="Yürüş", contributionAzn=round(km_delta)))

    if inp.accidentFree:
        delta = 0.06 * price
        price += delta
        shap.append(ShapContribution(
            feature="accident_free", label="Vuruğu yoxdur", contributionAzn=round(delta)))

    p50 = max(1_000, int(round(price, -2)))
    return ValuationResult(
        valuationId=str(uuid.uuid4()),
        vertical="vehicle",
        p10Azn=int(p50 * 0.92),
        p25Azn=int(p50 * 0.96),
        p50Azn=p50,
        p75Azn=int(p50 * 1.04),
        p90Azn=int(p50 * 1.08),
        confidence=0.4,
        shapTop=sorted(shap, key=lambda s: -abs(s.contributionAzn))[:8],
        compListingIds=[],
        modelVersion="veh-baseline-heuristic-0.0.1",
        createdAt=_now_iso(),
    )


@app.get("/health")
def health() -> dict[str, str]:
    tag = RE_MODEL.metadata.get("tag", "unknown") if RE_MODEL else MODEL_VERSION
    return {"status": "ok", "model": str(tag)}


@app.post("/v1/valuations", response_model=ValuationResult)
def create_valuation(dto: CreateValuationDto) -> ValuationResult:
    if dto.input.vertical == "real_estate":
        if RE_MODEL is not None:
            return _predict_real_estate_catboost(dto.input)
        return _estimate_real_estate(dto.input)
    # Otomotiv: ilk CatBoost modeli gayrimenkul; araç tarafı şimdilik heuristik
    return _estimate_vehicle(dto.input)
