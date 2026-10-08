"""Mülkiyyətçi lenti — başka sitelerde SAHİBİNİN verdiği son ilanlar.

NE YAPAR
--------
Bir bölgedeki (varsayılan: Binə qəsəbəsi) son N günün (varsayılan: 60) ev
ilanlarını bina.az ve tap.az'dan okur, "mülkiyyətçi" görünen emlakçıları
ayıklar ve kalanları owner_feed tablosuna yazar. pribor.az bunları kart olarak
gösterir; tıklayan kaynaktaki asıl ilana gider.

NE YAPMAZ (bilinçli)
--------------------
- Foto, açıklama metni, satıcı adı, telefon SAKLANMAZ. Açıklama yalnızca
  bellekte emlakçı ifadesi aramak için okunur. Kart olgusal alanlardan
  (fiyat, otaq, sahə, yer, tarih) kurulur; içerik kaynağında kalır.
- Hesap kimliği saklanmaz; yalnız tek yönlü özeti (seller_key) — aynı hesabın
  kaç ilanı olduğunu saymak için yeterli.

SAHTE MÜLKİYYƏTÇİ NASIL AYIKLANIR
---------------------------------
Binə ölçümü (2026-10-07, bina.az): 627 ilan, 281 hesap. Hesapların 242'sinin
TEK ilanı var — ama ilanların %57'si 3+ ilanlı hesaplardan geliyor. "Kamal"
adlı ajans görünmeyen bir hesap şehirde 48 ilan vermiş. Gerçek bir ev sahibi
aynı anda üç ev satmaz; en güçlü sinyal budur. Sırasıyla:

  1. Ajans / mağaza hesabı (bina.az AGENCY, tap.az shop)       → agent
  2. Hesabın aktif ilan sayısı ≥ ACCOUNT_LIMIT                  → agent
     (bina.az: şehir geneli, companyId sorgusu · tap.az: bölge taraması)
  3. Kendi beyanı "vasitəçi (agent)" (bina.az)                  → agent
  4. Açıklamada emlakçı dili (agentlik, komissiya, ofisimiz…)  → agent
  5. Aynı ev (tip+otaq+sahə+qiymət) başka hesapça da verilmiş   → duplicate
  6. Aynı ev iki sitede — biri kalır, diğeri                   → duplicate

Yalnız verdict='owner' olanlar sitede görünür; diğerleri gerekçesiyle
(reasons) tabloda kalır — eşiği ayarlamak ve "neden gizlendi" sorusunu
cevaplamak için.

YAYIN TARİHİ
------------
İki kaynak da ilk yayın tarihini vermiyor; `updatedAt` "irəli çək" ile
yenilenir ve aylık ilanı bugünkü gibi gösterir. Foto yükleme yolu ise tarih
taşır (…/uploads/thumbnail/2026%2F07%2F04%2F…) ve ilan açılırken yüklenir.
Fotosuz ilanlarda ilan kimliği monoton olduğu için en yakın kimliğin
tarihi kullanılır.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from .base import BaseScraper
from .models import RawListing
from .normalize.real_estate import normalize_real_estate

# Gerçek bir ev sahibinin aynı anda bu kadar aktif ilanı olmaz. 2 bilinçli
# olarak serbest: ev + torpaq satan, ya da satılık + kirayə veren sahip var.
ACCOUNT_LIMIT = 3

# Kaynak fiyatı USD verirse (bina.az'da nadir) — manat dolara sabitli.
FX_TO_AZN = {"AZN": 1.0, "USD": 1.7}


@dataclass(frozen=True)
class Area:
    slug: str
    settlement: str
    district: str
    bina_location_ids: tuple[str, ...]
    # tap.az'da bölge filtresi yok: anahtar sözcük araması + başlık süzgeci.
    # Anahtar sözcük açıklamada da eşleşir (Lökbatan ilanı "Binəyə yaxın"
    # diyebilir); başlık ise kaynağın ürettiği "…, Binə qəs." biçimindedir.
    tap_keyword: str
    tap_title_re: re.Pattern[str]


AREAS: dict[str, Area] = {
    "bine": Area(
        slug="bine",
        settlement="Binə",
        district="Xəzər",
        bina_location_ids=("79",),
        tap_keyword="Binə",
        # (?!\w) Binəqədi'yi dışarıda bırakır — ayrı bir rayon
        tap_title_re=re.compile(r"(?<!\w)Binə(?!\w)"),
    ),
}

PROPERTY_TYPES = ("apartment", "house", "land")


@dataclass
class FeedItem:
    source_site: str
    source_ext_id: str
    url: str
    deal_type: str                  # sale | rent
    property_type: str
    price_azn: int
    posted_at: datetime | None
    seller_key: str | None
    rooms: int | None = None
    area_m2: float | None = None
    land_area_sot: float | None = None
    floor: int | None = None
    total_floors: int | None = None
    district: str | None = None
    settlement: str | None = None
    has_repair: bool | None = None
    title_deed: bool | None = None
    verdict: str = "owner"
    reasons: list[str] = field(default_factory=list)

    def flag(self, verdict: str, reason: str) -> None:
        # İlk sert karar kalır (agent > duplicate); gerekçeler birikir
        if self.verdict == "owner":
            self.verdict = verdict
        self.reasons.append(reason)


# ------------------------------------------------------------ ortak yardımcılar

_PHOTO_DATE_RE = re.compile(r"/uploads/[^/]+/(\d{4})(?:%2F|/)(\d{2})(?:%2F|/)(\d{2})(?:%2F|/)")


def photo_date(url: str | None) -> datetime | None:
    """Foto yükleme yolundaki tarih → ilanın açıldığı gün (bkz. modül başlığı)."""
    if not url:
        return None
    m = _PHOTO_DATE_RE.search(url)
    if not m:
        return None
    y, mo, d = (int(g) for g in m.groups())
    try:
        return datetime(y, mo, d, tzinfo=timezone.utc)
    except ValueError:
        return None


def fill_missing_dates(items: list[FeedItem]) -> None:
    """Fotosuz ilanlara en yakın kimliğin tarihini ver (kimlikler monoton artar)."""
    known = sorted(
        (int(i.source_ext_id), i.posted_at) for i in items if i.posted_at is not None
    )
    if not known:
        return
    for it in items:
        if it.posted_at is None:
            n = int(it.source_ext_id)
            it.posted_at = min(known, key=lambda k: abs(k[0] - n))[1]
            it.reasons.append("tarix:texmini")


def seller_key(site: str, account_id: str | None) -> str | None:
    if not account_id:
        return None
    return hashlib.sha256(f"{site}:{account_id}".encode()).hexdigest()[:32]


_FOLD = str.maketrans("əıöüşçğİIƏÖÜŞÇĞ", "eiouscgiieouscg")


def fold(text: str) -> str:
    """Küçük harf + AZ harflerini Latin'e indir: "Ofisimizə" ve "ofisimize"
    aynı yazılsın — ilanların yarısı Azərbaycan hərfləri olmadan yazılıyor."""
    return text.lower().translate(_FOLD)


# Sahip dili — önce SİLİNİR, yoksa "vasitəçilər narahat etməsin" cümlesi
# emlakçı sözcüğü olarak sayılırdı. Bu ifadeyi yazan neredeyse hep sahiptir.
_OWNER_PHRASES = re.compile(
    r"(vasitec\w*|makler\w*|agent\w*|rieltor\w*|emlakc\w*)[\s,.]*"
    r"(narahat|zeng|yazmasin|olmasin|etmesin|buyurmasin|xahis)\w*"
    r"|vasitecisiz|sahibinden|mulkiyyetciden"
    r"|без\s+посредник\w*|посредник\w*\s+не\s+\w+|агентств\w*\s+не\s+\w+",
)

# Emlakçı dili (fold edilmiş metinde). Her biri ilan metinlerinde görülen
# kalıplar; tek başına "əmlak" gibi her ilanda geçebilecek sözcükler YOK.
_AGENT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (name, re.compile(pat))
    for name, pat in (
        ("agentlik", r"agentlik|agentliy|emlak agent|real estate|недвижимост"),
        ("ofis", r"emlak ofis|ofisimiz|ofisimize|ofisde gorus|офис\w* компании"),
        ("komissiya", r"komissiya|komisyon|xidmet haqq|vasitecilik|комисси"),
        ("musteri", r"musterilerimiz|alicilarimiz|наши\w* клиент"),
        ("teklif", r"teqdim edirik|bazamizda|diger variant|daha cox variant|basqa variant"),
        ("sosial", r"izleyiciler|abune olun|instagram|tiktok|telegram kanal"),
        ("sirket", r"\bmmc\b|remax|century\s?21|realt"),
        ("rieltor", r"rieltor|riyeltor|риелтор|риэлтор|агентств|makler"),
    )
)


def agent_text_signals(text: str | None) -> list[str]:
    if not text:
        return []
    t = _OWNER_PHRASES.sub(" ", fold(text))
    return [name for name, pat in _AGENT_PATTERNS if pat.search(t)]


def mark_duplicates(items: list[FeedItem]) -> None:
    """Aynı ev birden fazla kez verilmiş mi?

    Anahtar: (növ, tip, otaq, yuvarlak sahə/sot, qiymət). Aynı sitede FARKLI
    hesaplar aynı evi veriyorsa bu emlakçıların birbirinden kopyaladığı bir
    ilandır — sahibi kim, buradan bilinemez; hepsi gizlenir. İki sitede aynı
    ev varsa bu genelde sahibin iki yere yazmasıdır: bina.az kopyası kalır.
    """
    def key(i: FeedItem) -> tuple[Any, ...] | None:
        size = round(i.area_m2) if i.area_m2 else (round(i.land_area_sot or 0, 1) or None)
        if size is None:
            return None
        return (i.deal_type, i.property_type, i.rooms, size, i.price_azn)

    groups: dict[tuple[Any, ...], list[FeedItem]] = defaultdict(list)
    for it in items:
        if (k := key(it)) is not None:
            groups[k].append(it)

    for members in groups.values():
        if len(members) < 2:
            continue
        by_site: dict[str, list[FeedItem]] = defaultdict(list)
        for m in members:
            by_site[m.source_site].append(m)
        for site_members in by_site.values():
            sellers = {m.seller_key for m in site_members}
            if len(sellers) > 1:
                for m in site_members:
                    m.flag("duplicate", f"tekrar:{len(sellers)}_hesab")
        survivors = [m for m in members if m.verdict == "owner"]
        if len({m.source_site for m in survivors}) > 1:
            keep = next((m for m in survivors if m.source_site == "bina.az"), survivors[0])
            for m in survivors:
                if m is not keep:
                    m.flag("duplicate", f"diger_saytda:{keep.source_site}")


# ------------------------------------------------------------------- bina.az

class BinaAzFeed(BaseScraper):
    """bina.az GraphQL — arama + hesap sayımı + detay (yalnız adaylar için)."""

    source_site = "bina.az"
    base_url = "https://bina.az"
    GRAPHQL = "https://bina.az/graphql"
    PAGE = 24  # sunucunun kabul ettiği sayfa boyu (100 reddediliyor)

    # Kategori kimlikleri: `categories { id name }` sorgusundan
    CATEGORY_IDS = {"apartment": "1", "house": "5", "land": "9"}

    SEARCH = """
    query($f: ItemFilter, $a: String) {
      itemsConnection(first: %d, after: $a, filter: $f, sort: BUMPED_AT_DESC) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id path isLeased isBusiness rooms floor floors hasRepair hasBillOfSale
          area { value units } price { total currency }
          company { id targetType } preview { thumbnail }
        } }
      }
    }""" % PAGE

    COUNT = "query($f: ItemFilter) { itemsConnection(first: 1, filter: $f) { totalCount } }"

    # Açıklama yalnız burada, bellekte okunur — saklanmaz
    DETAIL = """
    query($id: ID!) {
      item(id: $id) { id contactTypeName description landArea { value units } }
    }"""

    def iter_listing_pages(self) -> Iterator[str]:
        raise NotImplementedError("bina.az GraphQL ile okunur; collect() bakınız")

    def parse_detail(self, html: str, url: str) -> RawListing | None:
        raise NotImplementedError("bina.az GraphQL ile okunur; collect() bakınız")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=20),
           reraise=True)
    def _gql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        if not self._robots.can_fetch(self.client.headers["User-Agent"], self.GRAPHQL):
            raise PermissionError(f"robots.txt izin vermiyor: {self.GRAPHQL}")
        self._throttle()
        res = self.client.post(self.GRAPHQL, json={"query": query, "variables": variables})
        res.raise_for_status()
        body = res.json()
        if "errors" in body:
            raise RuntimeError(body["errors"][0].get("message", "GraphQL hatası"))
        return body["data"]

    def _search(self, area: Area, category_id: str) -> list[dict[str, Any]]:
        f = {"cityId": "1", "locationIds": list(area.bina_location_ids),
             "categoryId": category_id}
        nodes: list[dict[str, Any]] = []
        after: str | None = None
        while True:
            conn = self._gql(self.SEARCH, {"f": f, "a": after})["itemsConnection"]
            nodes += [e["node"] for e in conn["edges"]]
            self.stats.bump("pages")
            info = conn["pageInfo"]
            if not info["hasNextPage"] or not info["endCursor"]:
                return nodes
            after = info["endCursor"]

    def collect(self, area: Area, since: datetime, types: tuple[str, ...]) -> list[FeedItem]:
        items: list[FeedItem] = []
        account_of: dict[str, str] = {}  # ext_id → hesap kimliği (bellekte)
        agency: set[str] = set()
        for ptype in types:
            for n in self._search(area, self.CATEGORY_IDS[ptype]):
                price = n.get("price") or {}
                rate = FX_TO_AZN.get(price.get("currency") or "")
                if not price.get("total") or rate is None:
                    self.stats.bump("skip_price")
                    continue
                company = n.get("company") or {}
                area_v = n.get("area") or {}
                it = FeedItem(
                    source_site=self.source_site,
                    source_ext_id=str(n["id"]),
                    url=f"{self.base_url}{n['path']}",
                    deal_type="rent" if n.get("isLeased") else "sale",
                    property_type=ptype,
                    price_azn=int(price["total"] * rate),
                    posted_at=photo_date((n.get("preview") or {}).get("thumbnail")),
                    seller_key=seller_key(self.source_site, company.get("id")),
                    rooms=n.get("rooms"),
                    area_m2=area_v.get("value") if area_v.get("units") == "m²" else None,
                    land_area_sot=area_v.get("value") if area_v.get("units") == "sot" else None,
                    floor=n.get("floor"),
                    total_floors=n.get("floors"),
                    district=area.district,
                    settlement=area.settlement,
                    has_repair=n.get("hasRepair"),
                    title_deed=n.get("hasBillOfSale"),
                )
                if company.get("id"):
                    account_of[it.source_ext_id] = str(company["id"])
                if company.get("targetType") == "AGENCY" or n.get("isBusiness"):
                    agency.add(it.source_ext_id)
                items.append(it)

        fill_missing_dates(items)
        # Bölge sayımı TÜM aktif ilanlar üzerinden (tarih süzgecinden önce)
        area_count = Counter(account_of.values())
        recent = [i for i in items if i.posted_at and i.posted_at >= since]
        self.stats.bump("seen", len(items))
        self.stats.bump("recent", len(recent))

        city_count: dict[str, int] = {}
        for it in recent:
            acc = account_of.get(it.source_ext_id)
            if it.source_ext_id in agency:
                it.flag("agent", "agentlik_hesabi")
                continue
            if acc and area_count[acc] >= ACCOUNT_LIMIT:
                it.flag("agent", f"hesab_elan_sayi:{area_count[acc]}")
                continue
            if acc:
                if acc not in city_count:
                    data = self._gql(self.COUNT, {"f": {"companyId": acc}})
                    city_count[acc] = int(data["itemsConnection"]["totalCount"])
                if city_count[acc] >= ACCOUNT_LIMIT:
                    it.flag("agent", f"hesab_elan_sayi:{city_count[acc]}")
                    continue
            detail = self._gql(self.DETAIL, {"id": it.source_ext_id}).get("item") or {}
            self.stats.bump("details")
            declared = fold(detail.get("contactTypeName") or "")
            if "vasiteci" in declared or "agent" in declared:
                it.flag("agent", "beyan:vasiteci")
            for sig in agent_text_signals(detail.get("description")):
                it.flag("agent", f"metn:{sig}")
            land = detail.get("landArea") or {}
            if it.land_area_sot is None and land.get("units") == "sot":
                it.land_area_sot = land.get("value")
        return recent


# -------------------------------------------------------------------- tap.az

class TapAzFeed(BaseScraper):
    """tap.az GraphQL — anahtar sözcükle bölge araması, başlıkla doğrulama."""

    source_site = "tap.az"
    base_url = "https://tap.az"
    GRAPHQL = "https://tap.az/graphql"
    BAKU_REGION_ID = "Z2lkOi8vdGFwL1JlZ2lvbi80MjA"
    CATEGORY_IDS = {
        "apartment": "Z2lkOi8vdGFwL0NhdGVnb3J5LzYzNQ",
        "house": "Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMQ",
        "land": "Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMg",
    }
    MAX_PAGES = 60  # kategori başına emniyet sınırı (24 × 60 = 1.440 ilan)

    SEARCH = """
    query($f: AdFilterInput, $k: String, $a: String) {
      adSearch(filters: $f, keywords: $k, source: DESKTOP) {
        ads(first: 24, after: $a) {
          nodes { legacyResourceId title price path body updatedAt
                  shop { id } user { id } photo { url } }
          pageInfo { endCursor hasNextPage }
        }
      }
    }"""

    def iter_listing_pages(self) -> Iterator[str]:
        raise NotImplementedError("tap.az GraphQL ile okunur; collect() bakınız")

    def parse_detail(self, html: str, url: str) -> RawListing | None:
        raise NotImplementedError("tap.az GraphQL ile okunur; collect() bakınız")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=20),
           reraise=True)
    def _page(self, ptype: str, keyword: str, after: str | None) -> dict[str, Any]:
        if not self._robots.can_fetch(self.client.headers["User-Agent"], self.GRAPHQL):
            raise PermissionError(f"robots.txt izin vermiyor: {self.GRAPHQL}")
        self._throttle()
        f = {"categoryId": self.CATEGORY_IDS[ptype], "regionId": self.BAKU_REGION_ID}
        res = self.client.post(self.GRAPHQL, json={
            "query": self.SEARCH, "variables": {"f": f, "k": keyword, "a": after}})
        res.raise_for_status()
        body = res.json()
        if "errors" in body:
            raise RuntimeError(body["errors"][0].get("message", "GraphQL hatası"))
        return body["data"]["adSearch"]["ads"]

    def collect(self, area: Area, since: datetime, types: tuple[str, ...]) -> list[FeedItem]:
        items: list[FeedItem] = []
        account_of: dict[str, str] = {}
        shop: set[str] = set()
        bodies: dict[str, str] = {}  # bellekte; yalnız emlakçı dili taraması için
        for ptype in types:
            after: str | None = None
            for _ in range(self.MAX_PAGES):
                ads = self._page(ptype, area.tap_keyword, after)
                self.stats.bump("pages")
                for n in ads.get("nodes") or []:
                    title = n.get("title") or ""
                    if not area.tap_title_re.search(title):
                        self.stats.bump("skip_other_place")
                        continue
                    ext_id = str(n["legacyResourceId"])
                    body = n.get("body") or ""
                    norm = normalize_real_estate(RawListing(
                        source_site=self.source_site, source_ext_id=ext_id,
                        url=f"{self.base_url}{n.get('path', '')}",
                        payload={"title": title, "description": body,
                                 "price_raw": n.get("price"), "property_type_hint": ptype},
                    ))
                    if not norm.price_azn:
                        self.stats.bump("skip_price")
                        continue
                    acc = (n.get("user") or {}).get("id")
                    it = FeedItem(
                        source_site=self.source_site,
                        source_ext_id=ext_id,
                        url=f"{self.base_url}{n.get('path', '')}",
                        deal_type=norm.listing_kind or "sale",
                        property_type=ptype,
                        price_azn=norm.price_azn,
                        posted_at=photo_date((n.get("photo") or {}).get("url")),
                        seller_key=seller_key(self.source_site, acc),
                        rooms=norm.rooms,
                        area_m2=norm.area_m2,
                        land_area_sot=norm.land_area_sot,
                        floor=norm.floor,
                        total_floors=norm.total_floors,
                        district=area.district,
                        settlement=area.settlement,
                        has_repair=(norm.repair_state >= 3) if norm.repair_state is not None else None,
                        title_deed=norm.title_deed,
                    )
                    if acc:
                        account_of[ext_id] = acc
                    if n.get("shop"):
                        shop.add(ext_id)
                    bodies[ext_id] = body
                    items.append(it)
                info = ads.get("pageInfo") or {}
                after = info.get("endCursor")
                if not info.get("hasNextPage") or not after:
                    break

        # Kategoriler örtüşebilir — kimlik başına bir kayıt
        items = list({i.source_ext_id: i for i in items}.values())
        fill_missing_dates(items)
        area_count = Counter(account_of.get(i.source_ext_id) for i in items)
        recent = [i for i in items if i.posted_at and i.posted_at >= since]
        self.stats.bump("seen", len(items))
        self.stats.bump("recent", len(recent))

        for it in recent:
            acc = account_of.get(it.source_ext_id)
            if it.source_ext_id in shop:
                it.flag("agent", "magaza_hesabi")
            elif acc and area_count[acc] >= ACCOUNT_LIMIT:
                it.flag("agent", f"hesab_elan_sayi:{area_count[acc]}")
            for sig in agent_text_signals(bodies.get(it.source_ext_id)):
                it.flag("agent", f"metn:{sig}")
            # Həyət evi başlığı otaq/sahə taşımıyor; gösterilecek kart boş
            # kalmasın diye YALNIZ sahip adayları için detay özellikleri okunur.
            if it.verdict == "owner" and (it.rooms is None or it.area_m2 is None):
                self._fill_from_properties(it, bodies.get(it.source_ext_id, ""))
        return recent

    DETAIL = "query($id: ID!) { ad(legacyId: $id) { title properties { name value } } }"

    def _fill_from_properties(self, it: FeedItem, body: str) -> None:
        try:
            self._throttle()
            res = self.client.post(self.GRAPHQL, json={
                "query": self.DETAIL, "variables": {"id": it.source_ext_id}})
            res.raise_for_status()
            ad = ((res.json().get("data") or {}).get("ad")) or {}
        except Exception as err:  # zenginleştirme opsiyonel — kart yine gösterilir
            print(f"[{self.source_site}] detay alınamadı {it.source_ext_id}: {err}")
            return
        self.stats.bump("details")
        props = {p["name"]: p["value"] for p in ad.get("properties") or []
                 if p.get("name") and p.get("value")}
        norm = normalize_real_estate(RawListing(
            source_site=self.source_site, source_ext_id=it.source_ext_id, url=it.url,
            payload={"title": ad.get("title") or "", "description": body, "props": props,
                     "property_type_hint": it.property_type},
        ))
        it.rooms = it.rooms if it.rooms is not None else norm.rooms
        it.area_m2 = it.area_m2 if it.area_m2 is not None else norm.area_m2
        it.land_area_sot = it.land_area_sot if it.land_area_sot is not None else norm.land_area_sot


SOURCES: dict[str, type[BinaAzFeed] | type[TapAzFeed]] = {
    BinaAzFeed.source_site: BinaAzFeed,
    TapAzFeed.source_site: TapAzFeed,
}


# ------------------------------------------------------------------ koşu + DB

def collect(area_slug: str, days: int, sources: tuple[str, ...],
            types: tuple[str, ...]) -> tuple[list[FeedItem], dict[str, Any]]:
    area = AREAS[area_slug]
    since = datetime.now(timezone.utc) - timedelta(days=days)
    items: list[FeedItem] = []
    stats: dict[str, Any] = {}
    for name in sources:
        src = SOURCES[name](mode="delta")
        try:
            got = src.collect(area, since, types)
        except Exception as err:  # bir kaynak düşerse diğeri yine yazılsın
            stats[name] = {"error": str(err), **src.stats}
            print(f"[{name}] HATA: {err}")
            continue
        finally:
            src.client.close()
        items += got
        stats[name] = dict(src.stats)
    mark_duplicates(items)
    stats["verdicts"] = dict(Counter(i.verdict for i in items))
    return items, stats


def write(items: list[FeedItem], sites_ok: tuple[str, ...], area_slug: str,
          started_at: datetime) -> None:
    """Upsert + bu koşuda görünmeyen kayıtları delist et.

    Delist yalnız BAŞARIYLA taranan kaynaklar için yapılır: tap.az koşusu
    ağ hatasıyla düştüyse onun ilanları "satıldı" sanılıp silinmemeli.
    """
    from .db import connect

    area = AREAS[area_slug]
    with connect() as conn:
        for it in items:
            conn.execute(
                """
                INSERT INTO owner_feed (
                  source_site, source_ext_id, url, deal_type, property_type,
                  rooms, area_m2, land_area_sot, floor, total_floors, price_azn,
                  district, settlement, has_repair, title_deed, posted_at,
                  seller_key, verdict, reasons, first_seen_at, last_seen_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),now())
                ON CONFLICT (source_site, source_ext_id) DO UPDATE SET
                  url = excluded.url, deal_type = excluded.deal_type,
                  property_type = excluded.property_type, rooms = excluded.rooms,
                  area_m2 = excluded.area_m2, land_area_sot = excluded.land_area_sot,
                  floor = excluded.floor, total_floors = excluded.total_floors,
                  price_azn = excluded.price_azn, has_repair = excluded.has_repair,
                  title_deed = excluded.title_deed, posted_at = excluded.posted_at,
                  seller_key = excluded.seller_key, verdict = excluded.verdict,
                  reasons = excluded.reasons, last_seen_at = now(), delisted_at = null
                """,
                (it.source_site, it.source_ext_id, it.url, it.deal_type, it.property_type,
                 it.rooms, it.area_m2, it.land_area_sot, it.floor, it.total_floors,
                 it.price_azn, it.district, it.settlement, it.has_repair, it.title_deed,
                 it.posted_at, it.seller_key, it.verdict, json.dumps(it.reasons)),
            )
        for site in sites_ok:
            conn.execute(
                """
                UPDATE owner_feed SET delisted_at = now()
                WHERE source_site = %s AND settlement = %s
                  AND delisted_at IS NULL AND last_seen_at < %s
                """,
                (site, area.settlement, started_at),
            )
        conn.commit()


def to_jsonable(items: list[FeedItem]) -> list[dict[str, Any]]:
    out = []
    for it in items:
        d = asdict(it)
        d["posted_at"] = it.posted_at.isoformat() if it.posted_at else None
        out.append(d)
    return out
