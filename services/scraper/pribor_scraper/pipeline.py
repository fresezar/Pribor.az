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


# ---------------------------------------------------------------
# Faz 0 sonu TODO'ları (sıralı):
#  1. scraped_listings upsert'i (psycopg): (source_site, source_ext_id) çakışırsa
#     last_seen_at güncelle, price değiştiyse price_snapshots'a satır düş.
#  2. Delist tespiti: full koşuda görünmeyen aktif kayda delisted_at damgala
#     — "satıldı" etiketinin ham hali, modelin en değerli sinyali.
#  3. Dedup kümeleme: telefon eşleşmesi (kesin) + metin MinHash (datasketch)
#     + foto pHash → dedup_cluster_id.
#  4. Geocode + metro mesafesi: locations upsert, PostGIS ST_Distance.
# ---------------------------------------------------------------
