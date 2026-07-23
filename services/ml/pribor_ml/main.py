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

import uuid
from datetime import datetime, timezone
from typing import Literal, Union

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Pribor Valuation API", version="0.0.1")

MODEL_VERSION = "re-baseline-heuristic-0.0.1"

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
    areaM2: float = Field(gt=0)
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
    p10Azn: int
    p50Azn: int
    p90Azn: int
    confidence: float
    shapTop: list[ShapContribution]
    compListingIds: list[str]
    modelVersion: str
    createdAt: str


def _now_iso() -> str:
    # Zod z.string().datetime() varsayılanı yalnızca 'Z' soneki kabul eder
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _estimate_real_estate(inp: RealEstateInput) -> ValuationResult:
    base_sqm = DISTRICT_SQM_AZN.get(inp.district, 1500)
    shap: list[ShapContribution] = []

    price = base_sqm * inp.areaM2

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
        p50Azn=p50,
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
        p50Azn=p50,
        p90Azn=int(p50 * 1.08),
        confidence=0.4,
        shapTop=sorted(shap, key=lambda s: -abs(s.contributionAzn))[:8],
        compListingIds=[],
        modelVersion="veh-baseline-heuristic-0.0.1",
        createdAt=_now_iso(),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_VERSION}


@app.post("/v1/valuations", response_model=ValuationResult)
def create_valuation(dto: CreateValuationDto) -> ValuationResult:
    if dto.input.vertical == "real_estate":
        return _estimate_real_estate(dto.input)
    return _estimate_vehicle(dto.input)
