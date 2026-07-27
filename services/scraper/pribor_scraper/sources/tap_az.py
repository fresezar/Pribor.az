"""tap.az — Bakı gayrimenkul ilanları (liste-öncelikli, JSON tabanlı).

TASARIM KARARLARI
-----------------
1) DETAY SAYFASI ÇEKİLMEZ. Site Next.js olduğu için her liste sayfası
   `__NEXT_DATA__` içinde 28 ilanın verisini hazır JSON olarak taşır. Bir
   istekte 28 kayıt demek: 20.000 ilan ≈ 715 istek. İlan başına detay sayfası
   çekseydik 20.000+ istek olurdu — kaynak siteye gereksiz yük.

2) HTML SEÇİCİ KULLANILMAZ. Sitenin CSS sınıfları build-hash'lidir
   (`sc-80e081dc-0 fUjvUq`) ve her deploy'da değişir; onlara dayanan scraper
   sessizce boş veri toplamaya başlar. `__NEXT_DATA__` JSON şeması çok daha
   kararlıdır ve alan adları anlamlıdır.

3) KİŞİSEL VERİ TOPLANMAZ. Telefon, satıcı adı, kullanıcı profili ve mesaj
   yolları payload'a alınmaz — modele girmeyecek veriyi saklamak gereksiz
   sorumluluktur. Liste sayfası zaten bunları içermez.

4) NAZİK TARAMA. BaseScraper'ın robots.txt kontrolü ve dakika başına istek
   limiti aynen geçerlidir (settings.requests_per_minute).
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

from ..base import BaseScraper
from ..models import RawListing

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL,
)

# Toplanacak kategoriler — tap.az yol adları. Bakı emlak dikeyinin tamamı.
CATEGORIES: tuple[tuple[str, str], ...] = (
    ("menziller", "apartment"),
    ("heyet-evleri-baglar-villalar", "house"),
    ("torpaq", "land"),
    ("obyektler-ofisler", "commercial"),
    ("qarajlar", "garage"),
)

# Bakı və Abşeron bölgə filtri (tap.az region id'si). Ölkənin qalanı modelə
# girmir — Bakı bazarını öyrədirik.
REGION_QUERY = "q%5Bregion%5D%5B%5D=8"


class TapAzScraper(BaseScraper):
    source_site = "tap.az"
    base_url = "https://tap.az"

    # delta: yalnız ilk N səhifə (ən yeni) · full: dərin tarama
    DELTA_PAGES = 8
    FULL_PAGES = 120

    def __init__(self, mode: str = "delta") -> None:  # type: ignore[override]
        super().__init__(mode)  # type: ignore[arg-type]

    # ---- BaseScraper sözleşmesi: bu kaynak liste-öncelikli çalıştığı için
    #      parse_detail kullanılmaz; run() override edilir. ----

    def iter_listing_pages(self) -> Iterator[str]:
        """Liste sayfası URL'leri (detay değil — bkz. modül başlığı)."""
        pages = self.DELTA_PAGES if self.mode == "delta" else self.FULL_PAGES
        for slug, _ptype in CATEGORIES:
            for page in range(1, pages + 1):
                yield f"{self.base_url}/elanlar/dasinmaz-emlak/{slug}?{REGION_QUERY}&page={page}"

    def parse_detail(self, html: str, url: str) -> RawListing | None:
        """Kullanılmaz — bu kaynakta liste sayfası toplu ayrıştırılır."""
        raise NotImplementedError("tap.az liste-öncelikli çalışır; run() bakınız")

    # ---- toplu ayrıştırma ----

    @staticmethod
    def _next_data(html: str) -> dict[str, Any] | None:
        m = _NEXT_DATA_RE.search(html)
        if not m:
            return None
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            return None

    def parse_list(self, html: str, page_url: str, property_type: str) -> list[RawListing]:
        """Bir liste sayfasındaki tüm ilanları RawListing'e çevirir."""
        data = self._next_data(html)
        if not data:
            return []
        state = (data.get("props", {}).get("pageProps", {}).get("apolloState") or {})

        out: list[RawListing] = []
        for key, node in state.items():
            if not key.startswith("Ad:") or not isinstance(node, dict):
                continue
            ext_id = node.get("legacyResourceId")
            title = node.get("title")
            if ext_id is None or not title:
                continue

            # Yalnız modele lazım olan alanlar. Telefon/satıcı/mesaj yolu ALINMAZ.
            out.append(RawListing(
                source_site=self.source_site,
                source_ext_id=str(ext_id),
                url=f"{self.base_url}{node.get('path', '')}",
                vertical_hint="real_estate",
                payload={
                    "title": title,
                    "price_raw": node.get("price"),
                    "region": node.get("region"),
                    "updated_at": node.get("updatedAt"),
                    "property_type_hint": property_type,
                    "list_page": page_url,
                },
            ))
        return out

    def run(self):  # type: ignore[override]
        """Liste sayfalarını gezer, her sayfadan 28 ilanı toplu yazar."""
        from ..storage import make_sink

        sink = make_sink(self.source_site, self.run_id)
        # URL üreticiden kategori bilgisini geri kazanmak için eşleme
        slug_to_type = dict(CATEGORIES)
        try:
            for url in self.iter_listing_pages():
                slug = url.split("/dasinmaz-emlak/")[1].split("?")[0]
                ptype = slug_to_type.get(slug, "apartment")
                try:
                    res = self.fetch(url)
                except Exception as err:
                    self.stats.bump("errors")
                    print(f"[{self.source_site}] HATA {url}: {err}")
                    continue
                self.stats.bump("pages")

                items = self.parse_list(res.text, url, ptype)
                if not items:
                    # Sayfalama bitti ya da şema değişti — ikisi de durma sebebi
                    self.stats.bump("empty_pages")
                    continue
                for item in items:
                    sink.write(item)
                    self.stats.bump("items")
                print(f"[{self.source_site}] {slug} s.{url.rsplit('page=', 1)[-1]} → {len(items)} elan")
        finally:
            sink.close()
            self.client.close()
        return self.stats
