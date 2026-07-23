"""BaseScraper — tüm kaynak scraper'larının ortak iskeleti.

Bir kaynak eklemek için (bkz. sources/example_site.py):
  1. BaseScraper'ı miras al, `source_site` ve `base_url` tanımla.
  2. `iter_listing_pages()` — liste sayfalarından ilan URL'leri üret.
  3. `parse_detail(html, url)` — detay sayfasından RawListing çıkar.
Politeness, retry, robots.txt, ham kayıt ve koşu muhasebesi burada hazır.
"""

from __future__ import annotations

import time
import urllib.robotparser
import uuid
from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Literal

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from .models import RawListing
from .settings import settings
from .storage import make_sink


class RunStats(dict):
    """{"pages": n, "items": n, "errors": n, "parse_fail": n} sayaçları."""

    def bump(self, key: str, n: int = 1) -> None:
        self[key] = self.get(key, 0) + n


class BaseScraper(ABC):
    source_site: str = "override-me"
    base_url: str = "https://example.invalid"

    def __init__(self, mode: Literal["delta", "full"] = "delta") -> None:
        self.mode = mode
        self.run_id = uuid.uuid4().hex[:12]
        self.stats = RunStats()
        self._last_request_at = 0.0
        self._robots = self._load_robots()
        self.client = httpx.Client(
            timeout=settings.request_timeout_sec,
            headers={
                "User-Agent": settings.user_agent,
                "Accept-Language": "az,ru;q=0.8,en;q=0.5",
            },
            follow_redirects=True,
        )

    # ---------- kaynak sitenin uygulayacağı kısım ----------

    @abstractmethod
    def iter_listing_pages(self) -> Iterator[str]:
        """Detay sayfası URL'leri üretir. `self.mode` delta ise yalnızca
        yeni/güncel ilanlara giden sıralamayı kullan (örn. ?sort=newest)."""

    @abstractmethod
    def parse_detail(self, html: str, url: str) -> RawListing | None:
        """Detay HTML'inden ham payload çıkarır. Ayrıştıramazsa None döner
        (sayaç artar — parse_fail oranı şema sağlığı alarmının girdisidir)."""

    # ---------- ortak makine ----------

    def _load_robots(self) -> urllib.robotparser.RobotFileParser:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{self.base_url.rstrip('/')}/robots.txt")
        try:
            rp.read()
        except Exception:
            # robots okunamadıysa muhafazakâr davran: her şeye izin varsayma,
            # ama koşuyu da durdurma — operatör loglardan görür
            pass
        return rp

    def _throttle(self) -> None:
        """Alan adı başına requests_per_minute limiti — nazik tarama."""
        min_interval = 60.0 / max(1, settings.requests_per_minute)
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        self._last_request_at = time.monotonic()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        reraise=True,
    )
    def fetch(self, url: str) -> httpx.Response:
        if not self._robots.can_fetch(settings.user_agent, url):
            raise PermissionError(f"robots.txt izin vermiyor: {url}")
        self._throttle()
        res = self.client.get(url)
        res.raise_for_status()
        return res

    def run(self) -> RunStats:
        """Koşuyu uçtan uca yürütür: URL üret → çek → ayrıştır → ham katmana yaz.

        DB muhasebesi (scrape_runs / raw_dumps upsert'leri) Faz 0 sonunda
        pipeline tarafında eklenir; şimdilik stats stdout'a düşer.
        """
        sink = make_sink(self.source_site, self.run_id)
        try:
            for url in self.iter_listing_pages():
                try:
                    res = self.fetch(url)
                except Exception as err:  # tek URL hatası koşuyu öldürmez
                    self.stats.bump("errors")
                    print(f"[{self.source_site}] HATA {url}: {err}")
                    continue

                item = self.parse_detail(res.text, url)
                if item is None:
                    self.stats.bump("parse_fail")
                    continue

                storage_key = sink.write(item)
                self.stats.bump("items")
                print(f"[{self.source_site}] + {item.source_ext_id} → {storage_key}")
        finally:
            sink.close()
            self.client.close()

        total = self.stats.get("items", 0) + self.stats.get("parse_fail", 0)
        if total and self.stats.get("parse_fail", 0) / total > 0.2:
            # Şema sağlığı alarmı: kaynak site muhtemelen tasarım değiştirdi
            print(f"[{self.source_site}] UYARI: parse_fail oranı %20'yi aştı — seçicileri kontrol et!")
        return self.stats
