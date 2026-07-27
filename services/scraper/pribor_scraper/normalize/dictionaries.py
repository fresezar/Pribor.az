"""Bakü pazarı normalizasyon sözlükleri — AZ/RU serbest metin → kanonik alanlar.

Bu dosya platformun en savunulabilir varlıklarından biridir: rakip bir
"fiyat tahmini" düğmesini kopyalayabilir, ama iki dilli pazar jargonunun
temiz eşlemesini ancak zamanla biriktirebilir. Her yeni kalıp görüldüğünde
buraya eklenir ve TÜM TARİH yeniden işlenir (ham katman sayesinde bedava).
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------
# Azerbaycan alfabesine duyarlı küçük harf dönüşümü.
# Python'un .lower()'ı 'İ' → 'i̇' (i + birleşen nokta) üretir; ayrıca
# Türkçe/Azerice kuralı 'I' → 'ı' olmalıdır. Önce eşle, sonra lower().
# ---------------------------------------------------------------
_AZ_CASE = str.maketrans({"İ": "i", "I": "ı"})


def az_lower(text: str) -> str:
    return text.translate(_AZ_CASE).lower()


def _contains_any(text: str, needles: tuple[str, ...]) -> bool:
    return any(n in text for n in needles)


# ---------------------------------------------------------------
# Təmir vəziyyəti — 0..5 sıralı ölçek (contracts.RepairState ile senkron)
# Sıra önemli: en spesifik/yüksek seviye önce denenir.
# ---------------------------------------------------------------
REPAIR_STATE_MAP: list[tuple[int, tuple[str, ...]]] = [
    (5, ("dizayner təmir", "dizayner temir", "əla təmir", "ela temir", "lüks təmir",
         "евроремонт", "дизайнерский ремонт", "люкс ремонт", "əla vəziyyət")),
    (4, ("yaxşı təmir", "yaxsi temir", "хороший ремонт", "хорошим ремонтом",
         "təmirli", "temirli", "с ремонтом")),
    (3, ("orta təmir", "orta temir", "normal təmir", "kosmetik təmir",
         "средний ремонт", "косметический ремонт")),
    (2, ("köhnə təmir", "kohne temir", "старый ремонт")),
    (1, ("təmirsiz", "temirsiz", "təmir tələb edir", "без ремонта",
         "требует ремонта")),
    (0, ("qara tikili", "черновая отделка", "предчистовая")),
]


def parse_repair_state(text: str) -> int | None:
    t = az_lower(text)
    for level, needles in REPAIR_STATE_MAP:
        if _contains_any(t, needles):
            return level
    return None


# ---------------------------------------------------------------
# Bina tipi
# ---------------------------------------------------------------
BUILDING_TYPE_MAP: dict[str, tuple[str, ...]] = {
    "yeni_tikili": ("yeni tikili", "novostroyka", "новостройка", "новостро"),
    "kohne_tikili": ("köhnə tikili", "kohne tikili", "старый фонд", "вторичка",
                     "вторичный фонд"),
    "stalinka": ("stalinka", "сталинка", "stalin layihə"),
}


def parse_building_type(text: str) -> str | None:
    t = az_lower(text)
    for canonical, needles in BUILDING_TYPE_MAP.items():
        if _contains_any(t, needles):
            return canonical
    return None


# ---------------------------------------------------------------
# Kupça / çıxarış (tapu) — Bakü'ye özgü kritik boolean.
# Önce NEGATİF kalıplar denenir: "kupça yoxdur" metni "kupça" içerir!
# ---------------------------------------------------------------
TITLE_DEED_FALSE = ("kupça yoxdur", "kupca yoxdur", "kupçası yoxdur", "sənədsiz",
                    "senedsiz", "çıxarış yoxdur", "müqavilə ilə", "без купчей",
                    "купчая отсутствует", "нет купчей")
TITLE_DEED_TRUE = ("kupçalı", "kupcali", "kupça var", "kupca var", "çıxarış var",
                   "cixaris var", "sənədli", "senedli", "sənədlər qaydasında",
                   "купчая есть", "есть купчая", "с купчей", "документы в порядке")


def parse_title_deed(text: str) -> bool | None:
    t = az_lower(text)
    if _contains_any(t, TITLE_DEED_FALSE):
        return False
    if _contains_any(t, TITLE_DEED_TRUE):
        return True
    return None


MORTGAGE_TRUE = ("ipoteka var", "ipotekaya yararlı", "ipoteka mümkündür",
                 "ипотека", "подходит под ипотеку")


def parse_mortgage(text: str) -> bool | None:
    return True if _contains_any(az_lower(text), MORTGAGE_TRUE) else None


# ---------------------------------------------------------------
# Otomotiv: kaza/boya ve gömrük durumu
# ---------------------------------------------------------------
ACCIDENT_FALSE = ("vuruq var", "vuruğu var", "qəzalı", "rənglənib", "renglenib",
                  "покрашена", "битая", "после дтп", "boyanıb")
ACCIDENT_TRUE = ("vuruğu yoxdur", "vurugu yoxdur", "qəzasız", "qezasiz",
                 "rənglənməyib", "boyasız", "boyasiz", "без покраски",
                 "не битая", "не крашена")


def parse_accident_free(text: str) -> bool | None:
    t = az_lower(text)
    if _contains_any(t, ACCIDENT_FALSE):
        return False
    if _contains_any(t, ACCIDENT_TRUE):
        return True
    return None


CUSTOMS_FALSE = ("gömrüksüz", "gomruksuz", "gömrükdən keçməyib", "не растаможен")
CUSTOMS_TRUE = ("gömrükdən keçib", "gomrukden kecib", "gömrük rüsumu ödənilib",
                "растаможен", "растаможена")


def parse_customs(text: str) -> bool | None:
    t = az_lower(text)
    if _contains_any(t, CUSTOMS_FALSE):
        return False
    if _contains_any(t, CUSTOMS_TRUE):
        return True
    return None


# ---------------------------------------------------------------
# Rayonlar — kanonik ad + AZ (diakritiksiz) ve RU takma adlar
# ---------------------------------------------------------------
DISTRICTS: dict[str, tuple[str, ...]] = {
    "Binəqədi": ("binəqədi", "sərdərov", "beneqedi", "binagadi", "бинагадин"),
    "Xətai": ("xətai", "xetai", "хатаин"),
    "Xəzər": ("xəzər r", "xezer r", "хазарск"),
    "Qaradağ": ("qaradağ", "qaradag", "карадагск"),
    "Nərimanov": ("nərimanov", "nerimanov", "наримановск"),
    "Nəsimi": ("nəsimi", "nesimi", "насиминск", "насими"),
    "Nizami": ("nizami r", "низаминск", "низами р"),
    "Pirallahı": ("pirallahı", "pirallahi", "пираллах"),
    "Sabunçu": ("sabunçu", "sabuncu", "сабунчин"),
    "Səbail": ("səbail", "sebail", "сабаильск", "сабаил"),
    "Suraxanı": ("suraxanı", "suraxani", "сураханск"),
    "Yasamal": ("yasamal", "ясамальск", "ясамал"),
    "Abşeron": ("abşeron", "abseron", "апшеронск", "xırdalan", "xirdalan", "masazır", "masazir"),
}


def parse_district(text: str) -> str | None:
    t = az_lower(text)
    for canonical, aliases in DISTRICTS.items():
        if az_lower(canonical) in t or _contains_any(t, aliases):
            return canonical
    return None


# ---------------------------------------------------------------
# Metro istasyonları (metin yakalama — gerçek mesafe PostGIS'te hesaplanır)
# ---------------------------------------------------------------
METRO_STATIONS: tuple[str, ...] = (
    "İçərişəhər", "Sahil", "28 May", "Gənclik", "Nəriman Nərimanov", "Ulduz",
    "Koroğlu", "Qara Qarayev", "Neftçilər", "Xalqlar Dostluğu", "Əhmədli",
    "Həzi Aslanov", "Nizami", "Elmlər Akademiyası", "İnşaatçılar", "20 Yanvar",
    "Memar Əcəmi", "Nəsimi", "Azadlıq prospekti", "Dərnəgül", "Cəfər Cabbarlı",
    "Şah İsmayıl Xətai", "Avtovağzal", "8 Noyabr",
)


def parse_metro(text: str) -> str | None:
    t = az_lower(text)
    # Uzun adlar önce — "Nəriman Nərimanov", "Nərimanov"u da içerir
    for station in sorted(METRO_STATIONS, key=len, reverse=True):
        if az_lower(station) in t:
            return station
    return None


# Metro istasyonu → rayon. Kaynak konumu yalnız istasyonla verdiğinde
# ("Gənclik m.") rayonu buradan türetiriz; yoksa kayıt rayonsuz kalır ve
# semt bazlı medyan/model hesaplarının dışına düşer.
METRO_DISTRICT: dict[str, str] = {
    "İçərişəhər": "Səbail", "Sahil": "Səbail",
    "28 May": "Nəsimi", "Gənclik": "Nəsimi", "Nəsimi": "Nəsimi",
    "Cəfər Cabbarlı": "Nəsimi",
    "Nəriman Nərimanov": "Nərimanov", "Ulduz": "Nərimanov", "Koroğlu": "Nərimanov",
    "Qara Qarayev": "Nizami", "Neftçilər": "Nizami", "Xalqlar Dostluğu": "Nizami",
    "Nizami": "Nizami",
    "Əhmədli": "Xətai", "Həzi Aslanov": "Xətai", "Şah İsmayıl Xətai": "Xətai",
    "Elmlər Akademiyası": "Yasamal", "İnşaatçılar": "Yasamal",
    "20 Yanvar": "Yasamal", "Memar Əcəmi": "Yasamal", "8 Noyabr": "Yasamal",
    "Azadlıq prospekti": "Binəqədi", "Dərnəgül": "Binəqədi", "Avtovağzal": "Binəqədi",
}


def district_of_metro(station: str | None) -> str | None:
    return METRO_DISTRICT.get(station) if station else None


# ---------------------------------------------------------------
# Konum eki ayrıştırıcı — kaynak başlıkları konumu ekle nitelendirir:
#   "Badamdar qəs."  → qəsəbə   "Gənclik m."    → metro
#   "Yasamal r."     → rayon    "Xırdalan ş."   → şəhər
#   "9-cu mkr."      → mikrorayon
# Ek, hangi granülerlikte veri geldiğini söyler; qəsəbə en değerlisidir
# çünkü rayon içi fiyat uçurumunu (Xəzər: Mərdəkan ↔ Türkan) ancak o açıklar.
# ---------------------------------------------------------------
_PLACE_RE = re.compile(
    r"([^,]+?)\s+(qəs|q|mkr|m|r|ş|k)\.\s*(?:,|$)",
    re.IGNORECASE,
)

_SUFFIX_KIND = {
    "qəs": "settlement", "q": "settlement", "mkr": "settlement",
    "m": "metro", "r": "district", "ş": "city", "k": "village",
}


def parse_place(text: str) -> tuple[str, str] | None:
    """'…, Badamdar qəs., 53 m²' → ('Badamdar', 'settlement').

    Eşleşme yoksa None. Ek yoksa konum belirsizdir; çağıran taraf
    serbest metin taramasına (parse_district/parse_metro) düşer.
    """
    for m in _PLACE_RE.finditer(text):
        name, suffix = m.group(1).strip(), m.group(2).lower()
        kind = _SUFFIX_KIND.get(suffix)
        # "86 m²" içindeki "m" ile karışmasın: ad sayıyla bitmemeli
        if kind and name and not name[-1].isdigit():
            return name, kind
    return None


# ---------------------------------------------------------------
# Sayısal ayrıştırıcılar
# ---------------------------------------------------------------
_PRICE_RE = re.compile(r"([\d\s.,]+)\s*(azn|manat|₼|usd|\$|dollar)?", re.IGNORECASE)


def parse_price(text: str) -> tuple[int, str] | None:
    """'160 000 AZN' → (160000, 'AZN') · '195.000 $' → (195000, 'USD').

    Dönüşüm YAPILMAZ (kur, gözlem gününe aittir) — pipeline USD'yi işaretler,
    AZN çevrimi günlük kurla işleme aşamasında yapılır.
    """
    m = _PRICE_RE.search(text)
    if not m:
        return None
    digits = re.sub(r"[^\d]", "", m.group(1))
    if not digits:
        return None
    cur_raw = (m.group(2) or "azn").lower()
    currency = "USD" if cur_raw in ("usd", "$", "dollar") else "AZN"
    return int(digits), currency


# DİKKAT: "м²" (Kiril м) ile "m²" (Latin m) FARKLI karakterlerdir. Rusça
# ilanlar Kiril yazıyor ("71 м²"); yalnız Latin aranırsa o ilanların sahəsi
# hiç okunmaz ve kayıt modele girmez.
_AREA_M2_RE = re.compile(r"([\d.,]+)\s*(?:m²|m2|м²|м2|kv\.?\s*m|кв\.?\s*м)", re.IGNORECASE)
_AREA_SOT_RE = re.compile(r"([\d.,]+)\s*(?:sot|сот)", re.IGNORECASE)


def _to_number(raw: str) -> float | None:
    """İlan metnindeki serbest yazılmış sayıyı float'a çevirir.

    Gerçek ilanlar temiz değildir: "Ev..131 m²" gibi yazımlar regex'e
    "..131" olarak takılıp float() çağrısını patlatıyordu — tek bozuk ilan
    tüm normalize koşusunu düşürüyor.

    Ayırıcı belirsizliği: "1.250" hem 1250 (binlik) hem 1.25 (ondalık)
    olabilir. Nokta sonrası tam 3 hane varsa binlik kabul edilir (emlakta
    "1.250 m²" yaygın; "72.26 m²" ondalıktır).
    """
    s = raw.replace(",", ".").strip(" .")
    if not s or not any(ch.isdigit() for ch in s):
        return None
    if s.count(".") > 1:  # "1.2.3" / "..131" → son parça ondalık sayılır
        head, _, tail = s.rpartition(".")
        s = head.replace(".", "") + "." + tail
    if s.count(".") == 1:
        head, tail = s.split(".")
        if len(tail) == 3:  # binlik ayırıcı: "1.250" → 1250
            s = head + tail
    try:
        return float(s)
    except ValueError:
        return None


def parse_area_m2(text: str) -> float | None:
    m = _AREA_M2_RE.search(text)
    return _to_number(m.group(1)) if m else None


def parse_area_sot(text: str) -> float | None:
    """Torpaq sahəsi 'sot' ile ölçülür (1 sot = 100 m²)."""
    m = _AREA_SOT_RE.search(text)
    return _to_number(m.group(1)) if m else None


# Kaynak başlıkları "2-otaqlı" biçimini kullanır — sayı ile kelime arasında
# tire var; yalnız \s* aranırsa oda sayısı hiç yakalanmaz.
_ROOMS_RE = re.compile(r"(\d{1,2})\s*[-–]?\s*(?:otaq|otaqlı|otaqli|комнат|комн|-х\s*комн)", re.IGNORECASE)


def parse_rooms(text: str) -> int | None:
    m = _ROOMS_RE.search(az_lower(text))
    return int(m.group(1)) if m else None


_FLOOR_RE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})")  # "4/9" = 4. kat, 9 katlı


def parse_floor(text: str) -> tuple[int, int] | None:
    m = _FLOOR_RE.search(text)
    if not m:
        return None
    floor, total = int(m.group(1)), int(m.group(2))
    return (floor, total) if floor <= total else None


_MILEAGE_RE = re.compile(r"([\d\s.,]+)\s*(min|тыс)?\.?\s*km", re.IGNORECASE)


def parse_mileage_km(text: str) -> int | None:
    """'150 000 km' → 150000 · '89 min km' → 89000 (AZ'de 'min' = bin!)."""
    m = _MILEAGE_RE.search(text)
    if not m:
        return None
    digits = re.sub(r"[^\d]", "", m.group(1))
    if not digits:
        return None
    value = int(digits)
    if m.group(2):  # "min" / "тыс" çarpanı
        value *= 1000
    return value


_PHONE_RE = re.compile(
    r"(?:\+?994|\(?0)\s*\)?\s*(\d{2})[\s\-\)]*(\d{3})[\s\-]*(\d{2})[\s\-]*(\d{2})"
)


def parse_phone(text: str) -> str | None:
    """Serbest yazılmış numarayı E.164'e çevirir: '(050) 123-45-67' → '+99450...'."""
    m = _PHONE_RE.search(text)
    if not m:
        return None
    return "+994" + "".join(m.groups())
