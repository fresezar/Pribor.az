"""Scraper ayarları — kök .env'den okunur (pydantic-settings)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# services/scraper/pribor_scraper/settings.py → repo kökü 3 seviye yukarıda
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Ham katman hedefi: lokal disk (geliştirme) veya S3/R2 (prod)
    raw_storage: Literal["local", "s3"] = "local"
    raw_local_dir: Path = REPO_ROOT / "services" / "scraper" / "data" / "raw"

    # S3/R2 — .env'deki S3_* değişkenleriyle eşleşir
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket_raw: str = "pribor-raw"
    s3_region: str = "auto"

    # Nazik tarama profili
    requests_per_minute: int = 20
    request_timeout_sec: float = 15.0
    max_retries: int = 3
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )


settings = Settings()
