"""Örnek kaynak scraper'ı — KURGUSAL bir ilan sitesi üzerinden kalıbı gösterir.

Gerçek bir kaynağa uyarlamak için:
  1. `source_site` / `base_url` değerlerini güncelle (hukuki değerlendirmeden sonra).
  2. Liste sayfası URL şablonunu ve sayfalama kuralını `iter_listing_pages`'e yaz.
  3. Detay sayfası seçicilerini `parse_detail`'e yaz — alan adlarını OLDUĞU GİBİ
     payload'a koy ("Sahə: 65 m²" → {"area": "65 m²"}). Çeviri/temizlik YOK;
     o iş pipeline.py'nin (normalize aşaması).

JS-ağır siteler için: httpx yerine Playwright kullan —
    pip install -e ".[browser]" && playwright install chromium
ve fetch adımını page.goto(url) + page.content() ile değiştir.
"""

from __future__ import annotations

from collections.abc import Iterator

from bs4 import BeautifulSoup

from ..base import BaseScraper
from ..models import RawListing


class ExampleSiteScraper(BaseScraper):
    source_site = "example-site"
    base_url = "https://ilan-sitesi.example"

    # delta: yalnızca ilk N sayfa (en yeni ilanlar) · full: tüm sayfalar
    DELTA_PAGES = 5
    FULL_PAGES = 200

    def iter_listing_pages(self) -> Iterator[str]:
        page_count = self.DELTA_PAGES if self.mode == "delta" else self.FULL_PAGES
        for page in range(1, page_count + 1):
            list_url = f"{self.base_url}/elanlar?sort=newest&page={page}"
            try:
                res = self.fetch(list_url)
            except Exception as err:
                self.stats.bump("errors")
                print(f"[{self.source_site}] liste sayfası hatası {list_url}: {err}")
                continue
            self.stats.bump("pages")

            soup = BeautifulSoup(res.text, "lxml")
            cards = soup.select("a.listing-card[href]")
            if not cards:
                # Sayfalama bitti veya seçici koptu — ikisi de durma sebebi
                return
            for a in cards:
                href = str(a["href"])
                yield href if href.startswith("http") else f"{self.base_url}{href}"

    def parse_detail(self, html: str, url: str) -> RawListing | None:
        soup = BeautifulSoup(html, "lxml")

        ext_id_el = soup.select_one("[data-listing-id]")
        title_el = soup.select_one("h1.listing-title")
        if ext_id_el is None or title_el is None:
            return None  # şema değişmiş olabilir — parse_fail sayacına düşer

        # Özellik tablosu: <dt>Sahə</dt><dd>65 m²</dd> çiftleri — ham bırakılır
        props: dict[str, str] = {}
        for dt, dd in zip(soup.select("dl.props dt"), soup.select("dl.props dd")):
            props[dt.get_text(strip=True)] = dd.get_text(strip=True)

        return RawListing(
            source_site=self.source_site,
            source_ext_id=str(ext_id_el["data-listing-id"]),
            url=url,
            vertical_hint="real_estate",
            payload={
                "title": title_el.get_text(strip=True),
                "price_text": (soup.select_one(".price") or title_el).get_text(strip=True),
                "description": (soup.select_one(".description") or title_el).get_text(" ", strip=True),
                "props": props,
                "breadcrumbs": [b.get_text(strip=True) for b in soup.select(".breadcrumb a")],
                "photo_urls": [str(img["src"]) for img in soup.select(".gallery img[src]")],
                "phone_text": (el.get_text(strip=True) if (el := soup.select_one(".phone")) else None),
            },
        )
