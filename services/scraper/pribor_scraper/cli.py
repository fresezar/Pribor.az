"""Pribor scraper CLI.

Kullanım (services/scraper içinde, .venv aktifken):
    pribor-scraper scrape example-site --mode delta
    pribor-scraper normalize data/raw/example-site/2026-07-23/abc123.jsonl
    pribor-scraper sources
"""

from __future__ import annotations

import sys
from pathlib import Path

import typer

# Windows konsolu cp1252 açılabilir — Türkçe/AZ karakterler için UTF-8'e zorla
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from .pipeline import ingest_run_file, normalize_run_file
from .sources import REGISTRY

app = typer.Typer(help="Pribor veri toplama düzlemi", no_args_is_help=True)


@app.command()
def sources() -> None:
    """Kayıtlı kaynak scraper'ları listeler."""
    for name, cls in REGISTRY.items():
        typer.echo(f"{name:20s} {cls.base_url}")


@app.command()
def scrape(
    source: str = typer.Argument(help="Kaynak adı (bkz. `sources`)"),
    mode: str = typer.Option("delta", help="delta: yeni ilanlar · full: tam tarama"),
) -> None:
    """Bir kaynağı tarar, ham JSONL'i immutable katmana yazar."""
    if source not in REGISTRY:
        typer.echo(f"Bilinmeyen kaynak: {source}. Mevcutlar: {', '.join(REGISTRY)}")
        raise typer.Exit(1)
    if mode not in ("delta", "full"):
        typer.echo("mode 'delta' veya 'full' olmalı")
        raise typer.Exit(1)

    scraper = REGISTRY[source](mode=mode)  # type: ignore[arg-type]
    stats = scraper.run()
    typer.echo(f"Koşu bitti [{scraper.run_id}]: {dict(stats)}")


@app.command()
def ingest(
    raw_file: Path = typer.Argument(help="Ham JSONL koşu dosyası"),
    run_type: str = typer.Option(
        "delta", "--run-type",
        help="delta | full — full, koşuda görünmeyen kayıtları delist eder"),
) -> None:
    """Ham koşu dosyasını normalize edip PostgreSQL'e işler
    (scrape_runs → raw_dumps → scraped_listings → price_snapshots)."""
    if not raw_file.exists():
        typer.echo(f"Dosya yok: {raw_file}")
        raise typer.Exit(1)
    if run_type not in ("delta", "full"):
        typer.echo("run-type 'delta' veya 'full' olmalı")
        raise typer.Exit(1)
    ingest_run_file(raw_file, run_type=run_type)


@app.command()
def seed(
    n: int = typer.Option(150, help="Üretilecek sentetik ilan sayısı"),
    price_drift: float = typer.Option(0.25, help="2. koşuda fiyatı değişen kayıt oranı"),
) -> None:
    """Sentetik Bakü ilanlarını GERÇEK ingest hattından geçirerek DB'yi doldurur
    (normalizasyon sözlükleri + upsert + fiyat geçmişi uçtan uca test edilir)."""
    from .seed import run_seed

    run_seed(n=n, price_drift_ratio=price_drift)


@app.command()
def normalize(
    raw_file: Path = typer.Argument(help="Ham JSONL koşu dosyası"),
    force: bool = typer.Option(False, "--force", help="Var olan normalize çıktıyı ez"),
) -> None:
    """Ham koşu dosyasını AZ/RU sözlüklerle normalize eder."""
    if not raw_file.exists():
        typer.echo(f"Dosya yok: {raw_file}")
        raise typer.Exit(1)
    normalize_run_file(raw_file, force=force)


if __name__ == "__main__":
    app()
