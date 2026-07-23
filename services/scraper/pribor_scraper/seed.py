"""Sentetik Bakü ilanı üreteci — DB'yi ve boru hattını gerçekçi veriyle test eder.

Önemli tasarım kararı: seed, scraped_listings'e DOĞRUDAN yazmaz. Gerçekçi
AZ/RU ilan METİNLERİ üretir, bunları normal scraper çıktısı gibi ham JSONL'e
yazar ve GERÇEK ingest hattından geçirir. Böylece tek komutla şunlar test
edilir: JSONL sink → RawListing → normalizasyon sözlükleri → raw_dumps →
scraped_listings upsert → price_snapshots.

İkinci aşama fiyat güncellemesi simüle eder (delta koşusu): kayıtların
~%25'inin fiyatı değişir → price_snapshots'ta gerçek fiyat geçmişi oluşur.

Kullanım:  pribor-scraper seed --n 150
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone

from .models import RawListing
from .pipeline import ingest_run_file
from .storage import LocalJsonlSink

SOURCE_SITE = "seed-baku"

_DISTRICT_SQM = {
    "Nərimanov": 2600, "Nəsimi": 2500, "Səbail": 3100, "Yasamal": 2300,
    "Xətai": 2000, "Nizami": 1850, "Binəqədi": 1600, "Sabunçu": 1300,
    "Suraxanı": 1200, "Xəzər": 1250, "Qaradağ": 1000,
}
_METRO_BY_DISTRICT = {
    "Nərimanov": "Gənclik", "Nəsimi": "Nizami", "Səbail": "İçərişəhər",
    "Yasamal": "İnşaatçılar", "Xətai": "Şah İsmayıl Xətai", "Nizami": "Qara Qarayev",
    "Binəqədi": "Azadlıq prospekti", "Sabunçu": "Koroğlu", "Suraxanı": "Həzi Aslanov",
}
_REPAIR_PHRASES = {
    5: ["əla təmirli", "dizayner təmiri ilə", "евроремонт"],
    4: ["yaxşı təmirli", "təmirli", "с хорошим ремонтом"],
    3: ["orta təmirli", "kosmetik təmirli"],
    1: ["təmirsiz", "təmir tələb edir"],
}
_KUPCA_PHRASES = {
    True: ["kupçalı", "sənədlər qaydasında", "çıxarış var"],
    False: ["kupça yoxdur", "sənədsiz, müqavilə ilə"],
}
_BUILDING_PHRASES = {
    "yeni_tikili": ["yeni tikili", "новостройка"],
    "kohne_tikili": ["köhnə tikili", "старый фонд"],
}
_CARS = [
    ("Toyota", ["Prius", "Camry", "Corolla"]),
    ("Hyundai", ["Elantra", "Sonata", "Tucson"]),
    ("Kia", ["Optima", "Sorento", "Rio"]),
    ("Mercedes", ["E 220", "C 200", "GLC 250"]),
    ("BMW", ["320", "520", "X5"]),
    ("LADA", ["Vesta", "Granta"]),
    ("Changan", ["CS35", "Eado"]),
]
_PHONES = ["(050) {a}-{b}-{c}", "(055) {a}-{b}-{c}", "(070) {a}-{b}-{c}", "(051) {a}-{b}-{c}"]


def _phone(rng: random.Random) -> str:
    tpl = rng.choice(_PHONES)
    return tpl.format(
        a=f"{rng.randint(100, 999)}", b=f"{rng.randint(10, 99)}", c=f"{rng.randint(10, 99)}")


def _make_re_listing(rng: random.Random, idx: int, fetched_at: datetime) -> tuple[RawListing, int]:
    district = rng.choice(list(_DISTRICT_SQM))
    rooms = rng.choices([1, 2, 3, 4], weights=[15, 40, 32, 13])[0]
    area = int(rooms * 32 + rng.gauss(8, 12))
    area = max(28, min(area, 320))
    repair = rng.choices([5, 4, 3, 1], weights=[22, 35, 30, 13])[0]
    building = rng.choices(["yeni_tikili", "kohne_tikili"], weights=[60, 40])[0]
    kupca = rng.random() < 0.85
    floor, total = rng.randint(1, 16), 0
    total = max(floor, rng.randint(5, 20))
    metro = _METRO_BY_DISTRICT.get(district)

    price = _DISTRICT_SQM[district] * area
    price *= 1 + (repair - 3) * 0.06
    price *= 1.05 if building == "yeni_tikili" else 0.97
    price *= 1.0 if kupca else 0.88
    price *= rng.lognormvariate(0, 0.09)
    price = int(round(price, -3))

    repair_txt = rng.choice(_REPAIR_PHRASES[repair])
    kupca_txt = rng.choice(_KUPCA_PHRASES[kupca])
    building_txt = rng.choice(_BUILDING_PHRASES[building])
    metro_txt = f" m. {metro} yaxınlığında," if metro and rng.random() < 0.7 else ""

    title = f"{rooms} otaqlı mənzil, {area} m², {district} r."
    description = (
        f"{district} rayonunda,{metro_txt} {building_txt}, {repair_txt} "
        f"{rooms} otaqlı mənzil satılır. Sahə {area} m², mərtəbə {floor}/{total}. "
        f"{kupca_txt.capitalize()}. İpoteka mümkündür."
        if kupca and rng.random() < 0.4
        else f"{district} rayonunda,{metro_txt} {building_txt}, {repair_txt} "
             f"{rooms} otaqlı mənzil. Sahə {area} m², mərtəbə {floor}/{total}. {kupca_txt.capitalize()}."
    )

    raw = RawListing(
        source_site=SOURCE_SITE,
        source_ext_id=f"re-{idx:05d}",
        url=f"https://seed.invalid/elan/re-{idx:05d}",
        fetched_at=fetched_at,
        vertical_hint="real_estate",
        payload={
            "title": title,
            "price_text": f"{price:,} AZN".replace(",", " "),
            "description": description,
            "props": {
                "Kateqoriya": "Mənzil",
                "Sahə": f"{area} m²",
                "Otaq sayı": str(rooms),
                "Mərtəbə": f"{floor}/{total}",
            },
            "breadcrumbs": ["Bakı", district],
            "photo_urls": [],
            "phone_text": _phone(rng),
        },
    )
    return raw, price


def _make_vehicle_listing(rng: random.Random, idx: int, fetched_at: datetime) -> tuple[RawListing, int]:
    make, models = rng.choice(_CARS)
    model = rng.choice(models)
    year = rng.randint(2008, 2024)
    km = int(max(5, (2026 - year) * rng.gauss(16, 5)) * 1000)
    accident_free = rng.random() < 0.6
    customs = rng.random() < 0.85

    base = {"Toyota": 38000, "Hyundai": 30000, "Kia": 29000, "Mercedes": 60000,
            "BMW": 55000, "LADA": 16000, "Changan": 22000}[make]
    price = base * (0.9 ** (2026 - year))
    price *= 1.06 if accident_free else 0.94
    price *= 1.0 if customs else 0.8
    price *= rng.lognormvariate(0, 0.08)
    price = max(3000, int(round(price, -2)))

    acc_txt = "vuruğu yoxdur, rənglənməyib" if accident_free else "rənglənib"
    customs_txt = "gömrükdən keçib" if customs else "gömrüksüz"
    km_txt = f"{km // 1000} min km" if rng.random() < 0.5 else f"{km:,} km".replace(",", " ")

    raw = RawListing(
        source_site=SOURCE_SITE,
        source_ext_id=f"veh-{idx:05d}",
        url=f"https://seed.invalid/elan/veh-{idx:05d}",
        fetched_at=fetched_at,
        vertical_hint="vehicle",
        payload={
            "title": f"{make} {model} {year}",
            "price_text": f"{price:,} AZN".replace(",", " "),
            "description": (
                f"{make} {model}, {year} il, yürüş {km_txt}, benzin, avtomat. "
                f"Vəziyyəti əla, {acc_txt}, {customs_txt}."
            ),
            "props": {"Buraxılış ili": str(year), "Yürüş": km_txt},
            "breadcrumbs": ["Bakı", "Avtomobillər", make],
            "photo_urls": [],
            "phone_text": _phone(rng),
        },
    )
    return raw, price


def run_seed(n: int = 150, seed: int = 42, price_drift_ratio: float = 0.25) -> None:
    rng = random.Random(seed)
    now = datetime.now(timezone.utc)

    # --- 1. koşu: ilk gözlemler (dün) ---
    run1_id = f"seed1-{uuid.uuid4().hex[:8]}"
    sink1 = LocalJsonlSink(SOURCE_SITE, run1_id)
    items: list[tuple[RawListing, int]] = []
    t0 = now - timedelta(days=1)
    for i in range(n):
        if rng.random() < 0.7:
            raw, price = _make_re_listing(rng, i, t0)
        else:
            raw, price = _make_vehicle_listing(rng, i, t0)
        sink1.write(raw)
        items.append((raw, price))
    sink1.close()
    print(f"→ 1. koşu ({n} ilan) ingest ediliyor…")
    ingest_run_file(sink1.path, run_type="delta")

    # --- 2. koşu: fiyat güncellemeleri (bugün) — price_snapshots'ı besler ---
    run2_id = f"seed2-{uuid.uuid4().hex[:8]}"
    sink2 = LocalJsonlSink(SOURCE_SITE, run2_id)
    changed = 0
    for raw, old_price in items:
        if rng.random() >= price_drift_ratio:
            continue
        # Bakü klasiği: pazarlık payı erimesi — çoğunlukla indirim
        factor = rng.choice([0.97, 0.95, 0.93, 1.03])
        new_price = int(round(old_price * factor, -2))
        payload = dict(raw.payload)
        payload["price_text"] = f"{new_price:,} AZN".replace(",", " ")
        sink2.write(RawListing(
            source_site=raw.source_site,
            source_ext_id=raw.source_ext_id,
            url=raw.url,
            fetched_at=now,
            vertical_hint=raw.vertical_hint,
            payload=payload,
        ))
        changed += 1
    sink2.close()
    print(f"→ 2. koşu ({changed} fiyat güncellemesi) ingest ediliyor…")
    ingest_run_file(sink2.path, run_type="delta")

    print(f"✔ Seed tamam: {n} ilan + {changed} fiyat değişimi "
          f"(scraped_listings + price_snapshots dolu)")
