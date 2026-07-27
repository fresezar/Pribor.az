"""Ham gayrimenkul payload'ı → NormalizedRealEstate.

Strateji: başlık + açıklama + özellik tablosu tek metin havuzunda taranır;
yapılandırılmış alan (props) varsa o ÖNCELİKLİDİR — serbest metin yalnızca
boşlukları doldurur. Ayrıştırılamayan her alan parse_warnings'e not düşer:
uyarı oranı, sözlüğün nerede zayıf kaldığını gösteren metriktir.
"""

from __future__ import annotations

import re
from typing import Any

from ..models import NormalizedRealEstate, RawListing
from . import dictionaries as d
from . import settlements as st

# "kirayə verilir" (mənzil/həyət evi), "icarəyə verilir" (obyekt) — bkz. normalize
RENT_TITLE_RE = re.compile(r"\b(kiray[əe]|icar[əe]y[əe]|аренд|сда[её]тся)", re.I)

# Kaynak sitelerin özellik tablosu anahtarları → bakılacak alan
# ("Sahə" AZ, "Площадь" RU vb. — yeni kaynak eklendikçe genişler)
PROP_KEYS_AREA = ("sahə", "sahe", "площадь", "ümumi sahə")
PROP_KEYS_ROOMS = ("otaq sayı", "otaq sayi", "otaqların sayı", "комнат")
PROP_KEYS_FLOOR = ("mərtəbə", "mertebe", "этаж")
PROP_KEYS_CATEGORY = ("kateqoriya", "əmlakın növü", "категория", "тип")
# Detay sorgusundan gelen yapılandırılmış konum ("Yerləşmə yeri": "Mehdiabad qəs.")
PROP_KEYS_PLACE = ("yerləşmə yeri", "yerləşdirmə yeri", "местоположение")

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
    # Bazı kaynaklar fiyatı hazır sayı verir (tap.az: price=250000); metin
    # ayrıştırmaya gerek yok ve hata payı sıfırdır.
    if isinstance(p.get("price_raw"), (int, float)) and p["price_raw"] > 0:
        out.price_azn = int(p["price_raw"])
        out.price_currency_raw = "AZN"
    elif price := d.parse_price(p.get("price_text", "") or ""):
        amount, currency = price
        out.price_currency_raw = currency
        # USD ilanlar işaretlenir; AZN çevrimi günlük kurla işleme katmanında
        out.price_azn = amount if currency == "AZN" else None
        if currency == "USD":
            warn("price_in_usd: günlük kurla çevrim gerekiyor")
    else:
        warn("price_unparsed")

    # --- kategori ---
    # Kaynak kategori sayfasından geldiyse tip KESİNDİR (scraper hangi
    # kategoriyi taradığını bilir); metinden tahmin etmeye gerek yok.
    # Metin tahmini yanılabiliyordu: "Torpaq sahəsi olan həyət evi" ilanı
    # land sanılıp sot→m² dönüşümüne giriyordu.
    hint = p.get("property_type_hint")
    if hint:
        out.property_type = str(hint)
    else:
        cat_text = _prop(props, PROP_KEYS_CATEGORY) or haystack
        t = d.az_lower(cat_text)
        for canonical, needles in CATEGORY_MAP.items():
            if any(n in t for n in needles):
                out.property_type = canonical
                break
    if out.property_type is None:
        warn("property_type_unparsed")

    # --- satılık mı kiralık mı ---
    # tap.az kategorileri ikisini birlikte döndürür; artık kaynakta filtreliyoruz
    # ama eski dosyalar ve filtresi olmayan kaynaklar için burada da bakıyoruz.
    # Başlık kaynak tarafından üretildiği için ifade tutarlıdır ("kirayə verilir",
    # obyektlerde "icarəyə verilir"). Metne değil YALNIZ başlığa bakılır: elan
    # metninde "kirayə verilməz" gibi cümleler geçebiliyor.
    out.listing_kind = "rent" if RENT_TITLE_RE.search(title) else "sale"

    # --- alan / oda / kat: önce yapılandırılmış alan, sonra serbest metin ---
    out.area_m2 = d.parse_area_m2(_prop(props, PROP_KEYS_AREA) or haystack)
    out.land_area_sot = d.parse_area_sot(haystack)
    # Torpaq (arsa) ilanlarında m² sahə yazılmaz, yalnızca sot verilir. Model ve
    # comps/deal hesabı m² üzerinden çalıştığı için sot'tan türetiyoruz (1 sot = 100 m²).
    if out.area_m2 is None and out.property_type == "land" and out.land_area_sot:
        out.area_m2 = out.land_area_sot * 100
    # props değeri çıplak sayı olabilir ("Otaq sayı": "2") — önce onu dene
    rooms_raw = (_prop(props, PROP_KEYS_ROOMS) or "").strip()
    if rooms_raw.isdigit():
        out.rooms = int(rooms_raw)
    else:
        out.rooms = d.parse_rooms(rooms_raw or haystack) or d.parse_rooms(haystack)
    if floor := d.parse_floor(_prop(props, PROP_KEYS_FLOOR) or haystack):
        out.floor, out.total_floors = floor

    # --- Bakü'ye özgü sözlük alanları ---
    out.building_type = d.parse_building_type(haystack)
    out.repair_state = d.parse_repair_state(haystack)
    out.title_deed = d.parse_title_deed(haystack)
    out.mortgage_eligible = d.parse_mortgage(haystack)
    out.metro_station = d.parse_metro(haystack)
    # İletişim bilgisi bilinçli olarak toplanmaz: modele girmeyen kişisel
    # veriyi saklamak gereksiz sorumluluktur (bkz. sources/tap_az.py).

    # --- konum: qəsəbə > rayon ---
    # Kaynak başlıkları konumu ekle nitelendirir ("Badamdar qəs.", "Yasamal r.").
    # Qəsəbə en değerli sinyaldir: rayon içi fiyat uçurumunu ancak o açıklar.
    # Detay sorgusunun "Yerləşmə yeri" alanı başlıkla aynı biçimdedir ama
    # kaynağın kendi yapılandırılmış değeri olduğu için önce ona bakılır.
    place = d.parse_place(_prop(props, PROP_KEYS_PLACE) or "") or d.parse_place(title)
    if place:
        name, kind = place
        if kind == "settlement":
            canonical, prof = st.resolve(name)
            if canonical:
                out.settlement = canonical
                out.district = prof.district if prof else None
            else:
                # Tanınmayan qəsəbə: adı sakla (sözlük zamanla genişler), ama
                # rayonu uydurma — serbest metin taraması aşağıda dener.
                out.settlement = name
                warn(f"settlement_unknown: {name}")
        elif kind == "district":
            out.district = d.parse_district(name)
        elif kind == "metro":
            # Başlıktaki açık metro bağlamı serbest metin tahmininden üstündür
            # ve kısaltmayı da çözer ("E.Akademiyası" → "Elmlər Akademiyası").
            out.metro_station = d.resolve_metro(name) or out.metro_station

    # Rayon hâlâ boşsa: önce serbest metinde geçen rayon adı, sonra metro.
    # Sıra önemli: parse_metro tüm metni tarar ve cadde adına takılabiliyor
    # ("Nizami küç." → Nizami metrosu → Nizami rayonu), oysa ilan Sumqayıt'ta
    # olabilir. Metinde açıkça yazan rayon daha güvenilir bir kanıttır.
    if out.district is None:
        out.district = d.parse_district(haystack) or d.district_of_metro(out.metro_station)

    if out.area_m2 is None and out.land_area_sot is None:
        warn("area_unparsed")
    if out.district is None:
        warn("district_unparsed")

    return out
