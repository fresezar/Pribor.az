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
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any

from ..base import BaseScraper
from ..models import RawListing

GRAPHQL_URL = "https://tap.az/graphql"

# Kategori kimlikleri GraphQL'den alındı (category(path:…){children{id}}).
# (kategori_id, kanonik property_type)
CATEGORIES: tuple[tuple[str, str, str], ...] = (
    ("Z2lkOi8vdGFwL0NhdGVnb3J5LzYzNQ", "menziller", "apartment"),
    ("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMQ", "heyet-evleri", "house"),
    ("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMg", "torpaq-sahesi", "land"),
    ("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwNQ", "obyektler-ve-ofisler", "commercial"),
    ("Z2lkOi8vdGFwL0NhdGVnb3J5LzYwMw", "qarajlar", "garage"),
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

    def _search(self, category_id: str, after: str | None) -> dict[str, Any] | None:
        """Tek sayfa çeker. Hız limiti ve robots kontrolü fetch ile aynı olsun
        diye throttle burada da uygulanır."""
        if not self._robots.can_fetch(self.client.headers["User-Agent"], GRAPHQL_URL):
            raise PermissionError(f"robots.txt izin vermiyor: {GRAPHQL_URL}")
        self._throttle()
        res = self.client.post(
            GRAPHQL_URL,
            json={
                "query": SEARCH_QUERY,
                "variables": {"f": {"categoryId": category_id}, "after": after},
            },
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
            for cat_id, slug, ptype in CATEGORIES:
                after: str | None = None
                for page in range(pages_limit):
                    try:
                        ads = self._search(cat_id, after)
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
