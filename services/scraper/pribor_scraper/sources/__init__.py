"""Kaynak scraper kayıt defteri — CLI buradan isimle çözer."""

from ..base import BaseScraper
from .example_site import ExampleSiteScraper
from .tap_az import TapAzScraper

REGISTRY: dict[str, type[BaseScraper]] = {
    ExampleSiteScraper.source_site: ExampleSiteScraper,
    TapAzScraper.source_site: TapAzScraper,
}
