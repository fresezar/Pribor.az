"""Temizleme boru hattı: ham JSONL koşu dosyası → normalize JSONL + istatistik.

Akış:  raw/{site}/{tarih}/{run}.jsonl
         → normalize (AZ/RU sözlükler)
         → clean/{site}/{tarih}/{run}.normalized.jsonl
         → (Faz 0 sonu) scraped_listings upsert + dedup kümeleme

Tasarım notu: pipeline ham dosyayı ASLA değiştirmez; normalize çıktı ayrı
dosyaya yazılır. Sözlükler geliştikçe aynı ham dosya yeniden işlenir —
`--force` ile eski normalize çıktının üstüne yazılır.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from .models import NormalizedRealEstate, NormalizedVehicle, RawListing
from .normalize import normalize_real_estate, normalize_vehicle


def normalize_run_file(raw_path: Path, force: bool = False) -> Path:
    """Bir koşunun ham JSONL dosyasını normalize eder; çıktı yolunu döndürür."""
    out_path = raw_path.with_suffix(".normalized.jsonl")
    # "raw" → "clean" klasör ikizlemesi (varsa)
    if "raw" in raw_path.parts:
        parts = list(raw_path.parts)
        parts[parts.index("raw")] = "clean"
        out_path = Path(*parts).with_suffix(".normalized.jsonl")
    if out_path.exists() and not force:
        raise FileExistsError(f"Normalize çıktı zaten var (--force ile ez): {out_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    stats: Counter[str] = Counter()
    warning_counts: Counter[str] = Counter()

    with raw_path.open(encoding="utf-8") as fin, out_path.open("w", encoding="utf-8") as fout:
        for line_no, line in enumerate(fin, start=1):
            line = line.strip()
            if not line:
                continue
            stats["read"] += 1
            try:
                raw = RawListing.model_validate(json.loads(line))
            except Exception:
                stats["invalid_raw"] += 1
                continue

            normalized: NormalizedRealEstate | NormalizedVehicle
            if raw.vertical_hint == "vehicle":
                normalized = normalize_vehicle(raw)
            else:
                normalized = normalize_real_estate(raw)

            for w in normalized.parse_warnings:
                warning_counts[w.split(":")[0]] += 1

            doc = normalized.model_dump(mode="json")
            doc["_raw_line"] = line_no  # ham satıra geri işaretçi (soy izi)
            doc["_content_hash"] = raw.content_hash
            fout.write(json.dumps(doc, ensure_ascii=False) + "\n")
            stats["written"] += 1

    print(f"✔ {raw_path.name}: {stats['written']}/{stats['read']} kayıt normalize edildi → {out_path}")
    if warning_counts:
        print("  Uyarı dağılımı (sözlüğün zayıf noktaları):")
        for warning, count in warning_counts.most_common(10):
            print(f"    {warning}: {count}")
    return out_path


def _storage_key_for(raw_path: Path, line_no: int) -> str:
    """Lokal dosya yolundan kanonik storage_key üretir:
    .../data/raw/site/2026-07-23/run.jsonl → 'raw/site/2026-07-23/run.jsonl#L42'"""
    parts = list(raw_path.parts)
    if "raw" in parts:
        rel = Path(*parts[parts.index("raw"):]).as_posix()
    else:
        rel = raw_path.name
    return f"{rel}#L{line_no}"


def ingest_run_file(raw_path: Path, run_type: str = "delta") -> dict[str, int]:
    """Ham JSONL koşu dosyasını uçtan uca DB'ye işler:

        scrape_runs → raw_dumps → normalize → scraped_listings upsert
                                            → fiyat değişiminde price_snapshots

    İdempotenttir: aynı dosya iki kez ingest edilirse ikinci koşu yalnızca
    last_seen_at günceller, fiyat geçmişine mükerrer satır düşmez.
    run_type='full' ise koşuda görünmeyen aktif kayıtlar delist edilir.
    """
    from . import db  # psycopg importu yalnızca ingest'te — scrape DB'siz çalışabilir

    COMMIT_EVERY = 500
    stats: Counter[str] = Counter()
    seen_ext_ids: set[str] = set()
    source_site: str | None = None

    with db.connect() as conn:
        run_id = None
        try:
            with raw_path.open(encoding="utf-8") as fin:
                for line_no, line in enumerate(fin, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    stats["read"] += 1
                    try:
                        raw = RawListing.model_validate(json.loads(line))
                    except Exception:
                        stats["invalid_raw"] += 1
                        continue

                    if run_id is None:
                        source_site = raw.source_site
                        run_id = db.create_run(conn, source_site, run_type)

                    seen_ext_ids.add(raw.source_ext_id)
                    dump_id = db.upsert_raw_dump(
                        conn, run_id, raw, _storage_key_for(raw_path, line_no))

                    norm: NormalizedRealEstate | NormalizedVehicle
                    if raw.vertical_hint == "vehicle":
                        norm = normalize_vehicle(raw)
                    else:
                        norm = normalize_real_estate(raw)

                    sl_id, old_price, new_price = db.upsert_scraped_listing(
                        conn, dump_id, norm, seen_at=raw.fetched_at)
                    if old_price is None:
                        stats["inserted"] += 1
                    else:
                        stats["updated"] += 1

                    if db.record_price_if_changed(
                        conn, sl_id, old_price, new_price,
                        observed_at=raw.fetched_at, source_site=raw.source_site,
                    ):
                        stats["price_snapshots"] += 1

                    if stats["read"] % COMMIT_EVERY == 0:
                        conn.commit()

            if run_type == "full" and source_site and seen_ext_ids:
                stats["delisted"] = db.mark_delisted(conn, source_site, seen_ext_ids)

            if run_id is not None:
                db.finish_run(conn, run_id, dict(stats))
            conn.commit()
        except Exception as err:
            conn.rollback()
            if run_id is not None:
                db.finish_run(conn, run_id, dict(stats), status="failed", error=str(err))
                conn.commit()
            raise

    print(f"✔ ingest {raw_path.name}: {dict(stats)}")
    return dict(stats)


# ---------------------------------------------------------------
# Sıradaki TODO'lar:
#  1. Dedup kümeleme: telefon eşleşmesi (kesin) + metin MinHash (datasketch)
#     + foto pHash → dedup_cluster_id.
#  2. Geocode + metro mesafesi: locations upsert, PostGIS ST_Distance.
#  3. USD ilanlar için günlük kur çevrimi (price_currency_raw='USD' işaretli).
# ---------------------------------------------------------------
