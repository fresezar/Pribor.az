"""Immutable ham katman: append-only JSONL sink'leri.

Düzen (lokal ve S3/R2'de aynı):
    raw/{source_site}/{YYYY-MM-DD}/{run_id}.jsonl

Kurallar:
  - Bir koşunun dosyasına yalnızca eklenir (append); asla yeniden yazılmaz.
  - Satır = RawListing.to_jsonl_line() (content_hash dahil).
  - DB'ye giden storage_key: "raw/<site>/<tarih>/<run_id>.jsonl#L<satır>"
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from .models import RawListing
from .settings import settings


class RawSink(ABC):
    """Bir scraper koşusunun ham çıktı hedefi."""

    def __init__(self, source_site: str, run_id: str) -> None:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.rel_key = f"raw/{source_site}/{date}/{run_id}.jsonl"
        self._line_no = 0

    @abstractmethod
    def _append_line(self, line: str) -> None: ...

    def write(self, item: RawListing) -> str:
        """Kaydı ekler; DB'ye yazılacak storage_key döndürür."""
        self._append_line(item.to_jsonl_line())
        self._line_no += 1
        return f"{self.rel_key}#L{self._line_no}"

    def close(self) -> None:  # alt sınıflar gerekirse override eder
        return None


class LocalJsonlSink(RawSink):
    """Geliştirme ortamı: services/scraper/data/raw altına yazar."""

    def __init__(self, source_site: str, run_id: str) -> None:
        super().__init__(source_site, run_id)
        self.path = settings.raw_local_dir / Path(self.rel_key).relative_to("raw")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self.path.open("a", encoding="utf-8")

    def _append_line(self, line: str) -> None:
        self._fh.write(line + "\n")
        self._fh.flush()

    def close(self) -> None:
        self._fh.close()


class S3JsonlSink(RawSink):
    """Prod: Cloudflare R2 (S3 uyumlu). Satırlar bellekte toplanır,
    close()'da tek nesne olarak konur — R2'de append olmadığı için koşu
    sonunda tek atomik PUT en sade güvenli yaklaşımdır. Çok uzun koşularda
    multipart upload'a geçilebilir (TODO Faz 1)."""

    def __init__(self, source_site: str, run_id: str) -> None:
        super().__init__(source_site, run_id)
        import boto3  # opsiyonel bağımlılık — yalnızca s3 modunda import

        self._buf = BytesIO()
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
        )

    def _append_line(self, line: str) -> None:
        self._buf.write(line.encode("utf-8") + b"\n")

    def close(self) -> None:
        self._buf.seek(0)
        self._client.put_object(
            Bucket=settings.s3_bucket_raw,
            Key=self.rel_key,
            Body=self._buf.getvalue(),
            ContentType="application/x-ndjson",
        )


def make_sink(source_site: str, run_id: str) -> RawSink:
    if settings.raw_storage == "s3":
        return S3JsonlSink(source_site, run_id)
    return LocalJsonlSink(source_site, run_id)
