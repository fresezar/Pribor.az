"""Bakı qəsəbələri — rayon eşlemesi + coğrafi profil.

NEDEN: İlan kaynakları konumu çoğu zaman yalnız qəsəbə adıyla verir
("Badamdar qəs.") — hangi rayonda olduğunu yazmaz. Rayonu buradan türetiriz.

NEDEN COĞRAFİ PROFİL: Metroya yakınlık şehir merkezinde güçlü bir fiyat
sinyalidir, ama qəsəbələrde metro yoktur ve sinyal anlamını yitirir. Xəzər
rayonunda Mərdəkan/Şüvəlan (deniz kenarı villa bölgesi) ile Türkan/Zirə
(uzak, seyrek) arasındaki uçurumu metro açıklayamaz. Bu yüzden her qəsəbəye
üç kaba sinyal veriyoruz: merkeze uzaklık, denize yakınlık, bölge karakteri.

DIŞ BAĞIMLILIK YOK: Değerler elle yazılmış sabitlerdir — geocoding API'si,
harita servisi ya da internet erişimi gerektirmez. Yaklaşıktır; amaç metre
hassasiyeti değil, qəsəbələri birbirine göre DOĞRU SIRALAMAKTIR. Modelin
esas öğrendiği şey qəsəbənin kendisidir (kategorik); bu sinyaller yalnızca
az örnekli qəsəbelerde (cold start) tahmini toparlar.
"""

from __future__ import annotations

from typing import NamedTuple


class SettlementProfile(NamedTuple):
    district: str
    """Şəhər mərkəzinə (İçərişəhər/Sahil) təxmini quş uçuşu məsafə, km."""
    center_km: float
    """Xəzər dənizi sahilinə təxmini məsafə, km (0 = sahil boyu)."""
    sea_km: float
    """Bölgə xarakteri — qiymət səviyyəsinin kaba göstəricisi."""
    character: str  # central | residential | suburb | villa_coast | industrial | rural


# character kısaltmaları
_C, _R, _S, _V, _I, _RU = "central", "residential", "suburb", "villa_coast", "industrial", "rural"

SETTLEMENTS: dict[str, SettlementProfile] = {
    # ---- Səbail (merkez + prestijli yamaç) ----
    "İçərişəhər": SettlementProfile("Səbail", 0.3, 0.6, _C),
    "Bayıl": SettlementProfile("Səbail", 3.5, 0.4, _R),
    "Badamdar": SettlementProfile("Səbail", 5.5, 2.5, _V),
    "Şıxov": SettlementProfile("Səbail", 9.0, 0.3, _S),
    "Bibiheybət": SettlementProfile("Səbail", 7.5, 0.5, _I),
    # ---- Nəsimi / Nərimanov / Yasamal / Nizami (şehir içi) ----
    "28 May": SettlementProfile("Nəsimi", 1.5, 1.8, _C),
    "Gənclik": SettlementProfile("Nəsimi", 3.0, 2.5, _C),
    "Montin": SettlementProfile("Nəsimi", 4.5, 3.0, _R),
    "Yeni Nəsimi": SettlementProfile("Nəsimi", 5.0, 3.5, _R),
    "Nərimanov": SettlementProfile("Nərimanov", 3.5, 1.5, _C),
    "Böyükşor": SettlementProfile("Nərimanov", 7.0, 3.0, _I),
    "Yasamal": SettlementProfile("Yasamal", 4.0, 3.5, _R),
    "Yeni Yasamal": SettlementProfile("Yasamal", 6.5, 5.5, _R),
    "20-ci sahə": SettlementProfile("Yasamal", 5.5, 4.5, _R),
    "Nizami": SettlementProfile("Nizami", 5.0, 3.0, _R),
    "Keşlə": SettlementProfile("Nizami", 6.5, 3.5, _R),
    "8-ci kilometr": SettlementProfile("Nizami", 8.0, 4.0, _R),
    "Qara Qarayev": SettlementProfile("Nizami", 7.0, 3.5, _R),
    # ---- Xətai ----
    "Xətai": SettlementProfile("Xətai", 4.0, 1.0, _R),
    "Əhmədli": SettlementProfile("Xətai", 8.5, 2.5, _R),
    "Həzi Aslanov": SettlementProfile("Xətai", 10.0, 2.0, _R),
    "Günəşli": SettlementProfile("Xətai", 11.0, 3.0, _S),
    "NZS": SettlementProfile("Xətai", 9.5, 1.5, _I),
    # ---- Binəqədi (mikrorayonlar) ----
    "Binəqədi": SettlementProfile("Binəqədi", 12.0, 8.0, _S),
    "Biləcəri": SettlementProfile("Binəqədi", 11.0, 8.5, _I),
    "Xocəsən": SettlementProfile("Binəqədi", 13.0, 9.0, _S),
    "M.Ə.Rəsulzadə": SettlementProfile("Binəqədi", 10.5, 7.5, _S),
    "Sulutəpə": SettlementProfile("Binəqədi", 12.5, 8.5, _S),
    "1-ci mikrorayon": SettlementProfile("Binəqədi", 7.5, 5.0, _R),
    "2-ci mikrorayon": SettlementProfile("Binəqədi", 7.8, 5.2, _R),
    "3-cü mikrorayon": SettlementProfile("Binəqədi", 8.0, 5.5, _R),
    "4-cü mikrorayon": SettlementProfile("Binəqədi", 8.3, 5.8, _R),
    "5-ci mikrorayon": SettlementProfile("Binəqədi", 8.6, 6.0, _R),
    "6-cı mikrorayon": SettlementProfile("Binəqədi", 9.0, 6.3, _R),
    "7-ci mikrorayon": SettlementProfile("Binəqədi", 9.3, 6.6, _R),
    "8-ci mikrorayon": SettlementProfile("Binəqədi", 9.6, 7.0, _R),
    "9-cu mikrorayon": SettlementProfile("Binəqədi", 10.0, 7.3, _R),
    # ---- Sabunçu (kuzey qəsəbələri) ----
    "Sabunçu": SettlementProfile("Sabunçu", 13.0, 5.0, _S),
    "Bakıxanov": SettlementProfile("Sabunçu", 10.0, 4.0, _R),
    "Ramana": SettlementProfile("Sabunçu", 13.5, 5.5, _S),
    "Zabrat": SettlementProfile("Sabunçu", 14.0, 5.0, _S),
    "Maştağa": SettlementProfile("Sabunçu", 22.0, 3.0, _S),
    "Nardaran": SettlementProfile("Sabunçu", 25.0, 1.0, _S),
    "Bilgəh": SettlementProfile("Sabunçu", 28.0, 0.4, _V),
    "Kürdəxanı": SettlementProfile("Sabunçu", 20.0, 4.5, _RU),
    "Pirşağı": SettlementProfile("Sabunçu", 26.0, 2.0, _RU),
    "Balaxanı": SettlementProfile("Sabunçu", 12.0, 6.0, _I),
    "Digah": SettlementProfile("Sabunçu", 18.0, 5.0, _RU),
    "Yeni Ramana": SettlementProfile("Sabunçu", 14.0, 5.5, _S),
    # ---- Xəzər (deniz kenarı — fiyat uçurumunun yaşandığı yer) ----
    "Binə": SettlementProfile("Xəzər", 18.0, 2.0, _S),
    "Türkan": SettlementProfile("Xəzər", 33.0, 2.5, _RU),
    "Qala": SettlementProfile("Xəzər", 30.0, 2.0, _RU),
    "Mərdəkan": SettlementProfile("Xəzər", 30.0, 1.0, _V),
    "Şüvəlan": SettlementProfile("Xəzər", 27.0, 0.8, _V),
    "Buzovna": SettlementProfile("Xəzər", 32.0, 0.5, _V),
    "Zirə": SettlementProfile("Xəzər", 38.0, 1.5, _RU),
    "Dübəndi": SettlementProfile("Xəzər", 42.0, 0.4, _RU),
    "Şağan": SettlementProfile("Xəzər", 29.0, 0.6, _V),
    # ---- Suraxanı ----
    "Suraxanı": SettlementProfile("Suraxanı", 12.0, 3.5, _I),
    "Hövsan": SettlementProfile("Suraxanı", 16.0, 1.0, _S),
    "Əmircan": SettlementProfile("Suraxanı", 11.0, 4.0, _S),
    "Zığ": SettlementProfile("Suraxanı", 13.0, 1.5, _I),
    "Bülbülə": SettlementProfile("Suraxanı", 14.0, 2.0, _S),
    "Qaraçuxur": SettlementProfile("Suraxanı", 11.5, 3.0, _R),
    "Yeni Suraxanı": SettlementProfile("Suraxanı", 12.5, 3.0, _S),
    "Dağlıq": SettlementProfile("Suraxanı", 13.5, 4.0, _S),
    # ---- Qaradağ (güneybatı, sanayi + uzak) ----
    "Lökbatan": SettlementProfile("Qaradağ", 18.0, 3.0, _S),
    "Səngəçal": SettlementProfile("Qaradağ", 42.0, 1.5, _I),
    "Ələt": SettlementProfile("Qaradağ", 65.0, 2.0, _RU),
    "Puta": SettlementProfile("Qaradağ", 28.0, 5.0, _I),
    "Müşfiqabad": SettlementProfile("Qaradağ", 20.0, 4.0, _S),
    "Sahil": SettlementProfile("Qaradağ", 24.0, 0.5, _S),
    "Qızıldaş": SettlementProfile("Qaradağ", 30.0, 3.0, _RU),
    "Şıxlar": SettlementProfile("Qaradağ", 26.0, 2.0, _RU),
    # ---- Pirallahı (ada) ----
    "Pirallahı": SettlementProfile("Pirallahı", 45.0, 0.3, _S),
    "Gürgan": SettlementProfile("Pirallahı", 43.0, 0.5, _RU),
    # ---- Abşeron (Bakı'ya bitişik, hızlı büyüyen) ----
    "Xırdalan": SettlementProfile("Abşeron", 13.0, 9.0, _R),
    "Masazır": SettlementProfile("Abşeron", 16.0, 8.0, _S),
    "Saray": SettlementProfile("Abşeron", 20.0, 7.0, _S),
    "Novxanı": SettlementProfile("Abşeron", 22.0, 1.5, _V),
    "Görədil": SettlementProfile("Abşeron", 24.0, 2.0, _S),
    "Fatmayi": SettlementProfile("Abşeron", 21.0, 6.0, _RU),
    "Ceyranbatan": SettlementProfile("Abşeron", 25.0, 8.0, _RU),
    "Qobu": SettlementProfile("Abşeron", 17.0, 6.5, _S),
    "Güzdək": SettlementProfile("Abşeron", 26.0, 7.0, _RU),
    "Hökməli": SettlementProfile("Abşeron", 15.0, 8.5, _S),
    "Məhəmmədi": SettlementProfile("Abşeron", 19.0, 7.5, _RU),
}

# İlan başlıklarında sık geçen kısaltma/yazım varyantları. Kaynak metni
# insan yazdığı için "Yeni Yasamal" bazen "Y. Yasamal" olur; eşleşmezse kayıt
# rayonsuz kalır ve model/medyan hesaplarının dışına düşer.
ALIASES: dict[str, str] = {
    "y. yasamal": "Yeni Yasamal",
    "y.yasamal": "Yeni Yasamal",
    "yeni yasamal q": "Yeni Yasamal",
    "y. suraxanı": "Yeni Suraxanı",
    "y. ramana": "Yeni Ramana",
    "m.ə.rəsulzadə": "M.Ə.Rəsulzadə",
    "m.e.resulzade": "M.Ə.Rəsulzadə",
    "rəsulzadə": "M.Ə.Rəsulzadə",
    "əhmədli": "Əhmədli",
    "8-ci km": "8-ci kilometr",
    "8 km": "8-ci kilometr",
    "20-ci sahə": "20-ci sahə",
    "20 ci sahə": "20-ci sahə",
    "içəri şəhər": "İçərişəhər",
    "xırdalan": "Xırdalan",
}

# Arama için normalize edilmiş dizin: "badamdar" → "Badamdar"
_INDEX: dict[str, str] = {}
for _name in SETTLEMENTS:
    _INDEX[_name.lower().replace("ı", "i").replace("İ", "i")] = _name
for _alias, _target in ALIASES.items():
    if _target in SETTLEMENTS:
        _INDEX[_alias.lower().replace("ı", "i").replace("İ", "i")] = _target


def _norm(s: str) -> str:
    return s.strip().lower().replace("ı", "i").replace("İ", "i")


def resolve(name: str | None) -> tuple[str | None, SettlementProfile | None]:
    """Qəsəbə adı → (kanonik ad, profil). Tanınmazsa (None, None)."""
    if not name:
        return None, None
    key = _norm(name)
    canonical = _INDEX.get(key)
    if canonical is None:
        return None, None
    return canonical, SETTLEMENTS[canonical]


def district_of(settlement: str | None) -> str | None:
    """Qəsəbədən rayonu türetir — kaynak yalnız qəsəbə verdiğinde kullanılır."""
    _, prof = resolve(settlement)
    return prof.district if prof else None
