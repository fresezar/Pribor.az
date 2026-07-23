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
    2: ["köhnə təmirli", "старый ремонт"],
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
_PHONES = ["(050) {a}-{b}-{c}", "(055) {a}-{b}-{c}", "(070) {a}-{b}-{c}", "(051) {a}-{b}-{c}"]


def _phone(rng: random.Random) -> str:
    tpl = rng.choice(_PHONES)
    return tpl.format(
        a=f"{rng.randint(100, 999)}", b=f"{rng.randint(10, 99)}", c=f"{rng.randint(10, 99)}")


def _mk_raw(idx: int, fetched_at: datetime, title: str, price: int, desc: str,
            props: dict[str, str], district: str, rng: random.Random) -> RawListing:
    return RawListing(
        source_site=SOURCE_SITE,
        source_ext_id=f"re-{idx:05d}",
        url=f"https://seed.invalid/elan/re-{idx:05d}",
        fetched_at=fetched_at,
        vertical_hint="real_estate",
        payload={
            "title": title,
            "price_text": f"{price:,} AZN".replace(",", " "),
            "description": desc,
            "props": props,
            "breadcrumbs": ["Bakı", district],
            "photo_urls": [],
            "phone_text": _phone(rng),
        },
    )


def _make_apartment(rng: random.Random, idx: int, fetched_at: datetime) -> tuple[RawListing, int]:
    district = rng.choice(list(_DISTRICT_SQM))
    rooms = rng.choices([1, 2, 3, 4], weights=[15, 40, 32, 13])[0]
    area = max(28, min(int(rooms * 32 + rng.gauss(8, 12)), 320))
    repair = rng.choices([5, 4, 3, 1], weights=[22, 35, 30, 13])[0]
    building = rng.choices(["yeni_tikili", "kohne_tikili"], weights=[60, 40])[0]
    kupca = rng.random() < 0.85
    floor = rng.randint(1, 16)
    total = max(floor, rng.randint(5, 20))
    metro = _METRO_BY_DISTRICT.get(district)

    price = _DISTRICT_SQM[district] * area
    price *= 1 + (repair - 3) * 0.06
    price *= 1.05 if building == "yeni_tikili" else 0.97
    price *= 1.0 if kupca else 0.88
    price *= rng.lognormvariate(0, 0.09)
    price = int(round(price, -3))

    metro_txt = f" m. {metro} yaxınlığında," if metro and rng.random() < 0.7 else ""
    desc = (
        f"{district} rayonunda,{metro_txt} {rng.choice(_BUILDING_PHRASES[building])}, "
        f"{rng.choice(_REPAIR_PHRASES[repair])} {rooms} otaqlı mənzil. "
        f"Sahə {area} m², mərtəbə {floor}/{total}. {rng.choice(_KUPCA_PHRASES[kupca]).capitalize()}."
    )
    props = {"Kateqoriya": "Mənzil", "Sahə": f"{area} m²",
             "Otaq sayı": str(rooms), "Mərtəbə": f"{floor}/{total}"}
    return _mk_raw(idx, fetched_at, f"{rooms} otaqlı mənzil, {area} m², {district} r.",
                   price, desc, props, district, rng), price


def _make_house(rng: random.Random, idx: int, fetched_at: datetime) -> tuple[RawListing, int]:
    district = rng.choice(list(_DISTRICT_SQM))
    rooms = rng.choices([3, 4, 5, 6], weights=[25, 32, 28, 15])[0]
    build_area = max(80, min(int(rooms * 45 + rng.gauss(20, 40)), 800))
    land_sot = round(max(1.5, rng.lognormvariate(1.6, 0.5)), 1)
    repair = rng.choices([5, 4, 3, 2], weights=[15, 30, 35, 20])[0]
    kupca = rng.random() < 0.80

    price = _DISTRICT_SQM[district] * 0.85 * build_area
    price += _DISTRICT_SQM[district] * 0.28 * (land_sot * 100)
    price *= 1 + (repair - 3) * 0.05
    price *= 1.0 if kupca else 0.85
    price *= rng.lognormvariate(0, 0.12)
    price = int(round(price, -3))

    desc = (
        f"{district} rayonunda {rng.choice(_REPAIR_PHRASES[repair])} {rooms} otaqlı "
        f"həyət evi. Tikili sahəsi {build_area} m², torpaq sahəsi {land_sot} sot. "
        f"{rng.choice(_KUPCA_PHRASES[kupca]).capitalize()}."
    )
    props = {"Kateqoriya": "Həyət evi / villa", "Sahə": f"{build_area} m²",
             "Torpaq sahəsi": f"{land_sot} sot", "Otaq sayı": str(rooms)}
    return _mk_raw(idx, fetched_at, f"Həyət evi, {build_area} m², {land_sot} sot, {district}",
                   price, desc, props, district, rng), price


def _make_land(rng: random.Random, idx: int, fetched_at: datetime) -> tuple[RawListing, int]:
    district = rng.choice(list(_DISTRICT_SQM))
    land_sot = round(max(1.0, rng.lognormvariate(2.0, 0.6)), 1)
    kupca = rng.random() < 0.75

    price = _DISTRICT_SQM[district] * 0.28 * (land_sot * 100)
    price *= 1.0 if kupca else 0.80
    price *= rng.lognormvariate(0, 0.15)
    price = int(round(price, -3))

    desc = (
        f"{district} rayonunda {land_sot} sot torpaq sahəsi satılır. "
        f"{rng.choice(_KUPCA_PHRASES[kupca]).capitalize()}. Tikinti üçün əlverişlidir."
    )
    props = {"Kateqoriya": "Torpaq", "Torpaq sahəsi": f"{land_sot} sot"}
    return _mk_raw(idx, fetched_at, f"Torpaq sahəsi, {land_sot} sot, {district}",
                   price, desc, props, district, rng), price


def _make_re_listing(rng: random.Random, idx: int, fetched_at: datetime) -> tuple[RawListing, int]:
    """Emlak tipini dağılıma göre seçer (eğitim dağılımıyla uyumlu)."""
    kind = rng.choices(["apartment", "house", "land"], weights=[74, 18, 8])[0]
    if kind == "apartment":
        return _make_apartment(rng, idx, fetched_at)
    if kind == "house":
        return _make_house(rng, idx, fetched_at)
    return _make_land(rng, idx, fetched_at)


def run_seed(n: int = 150, seed: int = 42, price_drift_ratio: float = 0.25) -> None:
    rng = random.Random(seed)
    now = datetime.now(timezone.utc)

    # --- 1. koşu: ilk gözlemler (dün) ---
    run1_id = f"seed1-{uuid.uuid4().hex[:8]}"
    sink1 = LocalJsonlSink(SOURCE_SITE, run1_id)
    items: list[tuple[RawListing, int]] = []
    t0 = now - timedelta(days=1)
    for i in range(n):
        # MVP odağı: yalnızca gayrimenkul (apartment / house / land)
        raw, price = _make_re_listing(rng, i, t0)
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
