"""tap.az — Bakı gayrimenkul ilanları (GraphQL, cursor sayfalama).

TASARIM KARARLARI
-----------------
1) GraphQL KULLANILIR, HTML DEĞİL. Site sayfalamayı Relay cursor'ı ile yapar
   (`ads(first: 24, after: <cursor>)`). HTML liste sayfasında `?page=N` diye
   bir mekanizma YOKTUR — o parametre sessizce yok sayılır ve her istek aynı
   ilanları döndürür. (İlk sürümde bu varsayılmıştı: 600 istek atılıp yalnız
   251 benzersiz ilan toplandı, %96 tekrar. Ölçülmeden varsayılan sayfalama
   hem veriyi hem kaynağın kaynaklarını boşa harcıyor.)

2) SUNUCUYA YÜK: istek başına 24 ilan ve HTML render'ı yok — sunucu sayfayı
   çizmiyor, yalnız JSON dönüyor. 20.000 ilan ≈ 835 istek.

3) KİŞİSEL VERİ TOPLANMAZ. Sorguda telefon/satıcı/mesaj alanları İSTENMEZ —
   modele girmeyecek veriyi çekmek gereksiz sorumluluktur.

4) NAZİK TARAMA: BaseScraper'ın robots.txt kontrolü ve dakika başına istek
   limiti (settings.requests_per_minute) aynen geçerlidir.

5) FİLTRE KAYNAKTA UYGULANIR (regionId + "Elan növü"). Kategoriler satılık ve
   KİRALIK ilanları birlikte döndürür: ilk koşuda mənzillərin %36'sı, həyət
   evlərinin %32'si kiralıktı (medyan 550 AZN'e karşı 140.000 AZN). Bu veri
   modele girseydi fiyat tahmini tamamen bozulurdu. Başlıktaki "kirayə
   verilir" ifadesiyle sonradan elemek mümkün ama kaynağın kendi bayrağı daha
   güvenilir — ve istek de harcanmamış olur. Aynı gerekçeyle regionId=Bakı:
   ürün Bakı'ya özgü, Qusar/Şəki ilanları modeli kirletir.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any, NamedTuple

from tenacity import retry, stop_after_attempt, wait_exponential

from ..base import BaseScraper
from ..models import RawListing

GRAPHQL_URL = "https://tap.az/graphql"

# Bakı — regions{} sorgusundan. Ürün Bakı'ya özgü olduğu için tarama da öyle.
BAKU_REGION_ID = "Z2lkOi8vdGFwL1JlZ2lvbi80MjA"


class Category(NamedTuple):
    """Bir tarama hedefi.

    sale_filter: ("Elan növü" özellik id'si, "Satılır" seçenek id'si). Kimlikler
    category(path:…){properties{…options{…}}} sorgusundan alındı. Torpaq ve
    qarajda böyle bir özellik yok — o kategoriler zaten yalnız satılık.
    """

    id: str
    slug: str
    property_type: str
    sale_filter: tuple[int, str] | None = None


CATEGORIES: tuple[Category, ...] = (
    Category("Z2lkOi8vdGFwL0NhdGVnb3J5LzYzNQ", "menziller", "apartment", (740, "3722")),
    Category("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMQ", "heyet-evleri", "house", (750, "3869")),
    Category("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMg", "torpaq-sahesi", "land"),
    Category("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwNQ", "obyektler-ve-ofisler", "commercial", (818, "4162")),
    Category("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMw", "qarajlar", "garage"),
)

# Yalnız modele lazım olan alanlar istenir (kişisel veri yok).
#
# `body` (elan mətni) neden alınıyor: həyət evi / obyekt / qaraj ilanlarında
# sahə BAŞLIKTA yazmaz ("Həyət evi, Xırdalan ş."), yalnız mətndə geçer. Ölçü
# oradan okunuyor — aksi halde bu kategorilerin sahəsi hiç bilinmez ve modele
# giremezler. Mətn ayrıca mərtəbə ("5/4"), kupça ve təmir sinyali de taşır.
# Detay sayfası çekmeye gerek kalmıyor: 9.500+ ek istek yerine sıfır.
SEARCH_QUERY = """
query PriborSearch($f: AdFilterInput, $after: String) {
  adSearch(filters: $f, source: DESKTOP) {
    ads(first: 24, after: $after) {
      nodes { legacyResourceId title price region path updatedAt body }
      pageInfo { endCursor hasNextPage }
    }
  }
}
"""

# Elan mətnində satıcı telefonu geçebilir. Kişisel veri saklamamak için ham
# katmana yazmadan ÖNCE maskelenir — modele girmeyecek veriyi tutmuyoruz.
_PHONE_RE = re.compile(
    r"\b(?:\+?994[\s-]?)?\(?0?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b"
)


class TapAzScraper(BaseScraper):
    source_site = "tap.az"
    base_url = "https://tap.az"

    # Kategori başına çekilecek sayfa (sayfa = 24 ilan)
    DELTA_PAGES = 10      # ~240 ilan/kategori — günlük yeni ilanlar
    FULL_PAGES = 400      # ~9.600 ilan/kategori — ilk derin tarama

    # ---- BaseScraper sözleşmesi: bu kaynak GraphQL ile çalıştığı için
    #      URL üreteci/parse_detail kullanılmaz; run() override edilir. ----

    def iter_listing_pages(self) -> Iterator[str]:
        raise NotImplementedError("tap.az GraphQL ile sayfalanır; run() bakınız")

    def parse_detail(self, html: str, url: str) -> RawListing | None:
        raise NotImplementedError("tap.az GraphQL ile sayfalanır; run() bakınız")

    # ---- GraphQL ----

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=20),
        reraise=True,
    )
    def _search(self, cat: Category, after: str | None) -> dict[str, Any] | None:
        """Tek sayfa çeker. Hız limiti ve robots kontrolü fetch ile aynı olsun
        diye throttle burada da uygulanır.

        Retry şart: geçici bir ağ hatası (DNS, timeout) ilk sayfada gelirse
        kategori komple atlanıyordu — bir koşuda həyət evi ve torpaq böyle
        kaybedilmişti (16.000+ ilan).
        """
        if not self._robots.can_fetch(self.client.headers["User-Agent"], GRAPHQL_URL):
            raise PermissionError(f"robots.txt izin vermiyor: {GRAPHQL_URL}")
        filters: dict[str, Any] = {"categoryId": cat.id, "regionId": BAKU_REGION_ID}
        if cat.sale_filter:
            prop_id, option_id = cat.sale_filter
            filters["propertyOptions"] = {
                "collection": [{"legacyId": prop_id, "value": option_id}]
            }
        self._throttle()
        res = self.client.post(
            GRAPHQL_URL,
            json={"query": SEARCH_QUERY, "variables": {"f": filters, "after": after}},
        )
        res.raise_for_status()
        body = res.json()
        if "errors" in body:
            print(f"[{self.source_site}] GraphQL hatası: {body['errors'][0].get('message')}")
            return None
        return body.get("data", {}).get("adSearch", {}).get("ads")

    @staticmethod
    def _to_raw(node: dict[str, Any], property_type: str) -> RawListing | None:
        ext_id, title = node.get("legacyResourceId"), node.get("title")
        if ext_id is None or not title:
            return None
        body = node.get("body") or ""
        return RawListing(
            source_site="tap.az",
            source_ext_id=str(ext_id),
            url=f"https://tap.az{node.get('path', '')}",
            vertical_hint="real_estate",
            payload={
                "title": title,
                # normalize hattı serbest metni "description" alanında arar
                "description": _PHONE_RE.sub("[nömrə]", body),
                "price_raw": node.get("price"),
                "region": node.get("region"),
                "updated_at": node.get("updatedAt"),
                "property_type_hint": property_type,
            },
        )

    def run(self):  # type: ignore[override]
        from ..storage import make_sink

        pages_limit = self.DELTA_PAGES if self.mode == "delta" else self.FULL_PAGES
        sink = make_sink(self.source_site, self.run_id)
        seen: set[str] = set()  # koşu içi tekilleştirme (kategoriler örtüşebilir)
        try:
            for cat in CATEGORIES:
                slug, ptype = cat.slug, cat.property_type
                after: str | None = None
                for page in range(pages_limit):
                    try:
                        ads = self._search(cat, after)
                    except Exception as err:
                        self.stats.bump("errors")
                        print(f"[{self.source_site}] HATA {slug} s.{page + 1}: {err}")
                        break
                    if not ads:
                        self.stats.bump("errors")
                        break

                    self.stats.bump("pages")
                    nodes = ads.get("nodes") or []
                    new = 0
                    for node in nodes:
                        item = self._to_raw(node, ptype)
                        if item is None:
                            self.stats.bump("parse_fail")
                            continue
                        if item.source_ext_id in seen:
                            self.stats.bump("duplicates")
                            continue
                        seen.add(item.source_ext_id)
                        sink.write(item)
                        self.stats.bump("items")
                        new += 1

                    info = ads.get("pageInfo") or {}
                    after = info.get("endCursor")
                    if not info.get("hasNextPage") or not after:
                        print(f"[{self.source_site}] {slug}: sayfalama bitti ({page + 1} sayfa)")
                        break
                    if page % 20 == 0:
                        print(f"[{self.source_site}] {slug} s.{page + 1} → +{new} (toplam {len(seen)})")
        finally:
            sink.close()
            self.client.close()
        return self.stats
