"""Kaynak scraper kayıt defteri — CLI buradan isimle çözer."""

from ..base import BaseScraper
from .example_site import ExampleSiteScraper

REGISTRY: dict[str, type[BaseScraper]] = {
    ExampleSiteScraper.source_site: ExampleSiteScraper,
}
