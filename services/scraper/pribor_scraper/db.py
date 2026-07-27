"""DB upsert katmanı — ham/normalize veriyi PostgreSQL'e yazar.

Akış (cli.py `ingest` komutu):
    scrape_runs   ← koşu muhasebesi (running → succeeded + stats)
    raw_dumps     ← ham satır işaretçisi (site, ext_id, content_hash) benzersiz
    scraped_listings ← normalize upsert; (site, ext_id) çakışırsa güncelle
    price_snapshots  ← ilk gözlem VEYA fiyat değişimi → hypertable'a satır

Tasarım notları:
  - Tek transaction/commit penceresi COMMIT_EVERY kayıtta bir — yarıda kesilen
    ingest kaldığı yerden idempotent şekilde tekrar koşulabilir (tüm yazımlar
    ON CONFLICT korumalı).
  - price_snapshots.ref_kind='scraped' + ref_id=scraped_listings.id (soft ref).
  - Fiyat karşılaştırması CTE ile TEK statement'ta: `old` upsert öncesi
    snapshot'ı okur (CTE'ler statement başındaki durumu görür).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from .models import NormalizedRealEstate, NormalizedVehicle, RawListing
from .settings import settings

Normalized = NormalizedRealEstate | NormalizedVehicle


def connect() -> psycopg.Connection:
    """Yönetilen Postgres'e (Neon vb.) dayanıklı bağlantı.

    TCP keepalive OLMADAN uzun ingest koşuları "connection is lost" ile
    düşüyordu: 30.000 kayıtlık bir koşuda normalize/parse işi sürerken soket
    sessiz kalıyor, bulut havuzu da boşta sandığı bağlantıyı kapatıyor.
    Keepalive paketleri bağlantıyı canlı tutar.

    Koşu yine de yarıda kesilirse tekrar çalıştırmak güvenlidir — tüm
    yazımlar ON CONFLICT korumalıdır (bkz. modül başlığı).
    """
    return psycopg.connect(
        settings.database_url,
        keepalives=1,
        keepalives_idle=30,     # 30 sn sessizlikten sonra yokla
        keepalives_interval=10,  # yanıt yoksa 10 sn'de bir tekrar
        keepalives_count=5,      # 5 denemede yanıt yoksa kopmuş say
    )


# ---------------------------------------------------------------- scrape_runs

def create_run(conn: psycopg.Connection, source_site: str, run_type: str) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO scrape_runs (source_site, run_type, status)
        VALUES (%s, %s, 'running')
        RETURNING id
        """,
        (source_site, run_type),
    ).fetchone()
    assert row is not None
    return row[0]


def finish_run(
    conn: psycopg.Connection,
    run_id: uuid.UUID,
    stats: dict[str, Any],
    status: str = "succeeded",
    error: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE scrape_runs
        SET status = %s, stats = %s, error = %s, finished_at = now()
        WHERE id = %s
        """,
        (status, Jsonb(stats), error, run_id),
    )


# ----------------------------------------------------------------- raw_dumps

def upsert_raw_dump(
    conn: psycopg.Connection,
    run_id: uuid.UUID,
    raw: RawListing,
    storage_key: str,
) -> uuid.UUID:
    """İçerik hash'i aynıysa var olan satırın id'si döner (tarih asla ezilmez).

    ON CONFLICT DO UPDATE'in no-op'u bilinçli: DO NOTHING çakışmada RETURNING
    döndürmez; id'yi tek round-trip'te almak için standart numara budur.
    """
    row = conn.execute(
        """
        INSERT INTO raw_dumps
          (run_id, source_site, source_ext_id, url, http_status,
           storage_key, content_hash, fetched_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (source_site, source_ext_id, content_hash)
        DO UPDATE SET source_site = raw_dumps.source_site
        RETURNING id
        """,
        (
            run_id,
            raw.source_site,
            raw.source_ext_id,
            raw.url,
            raw.http_status,
            storage_key,
            raw.content_hash,
            raw.fetched_at,
        ),
    ).fetchone()
    assert row is not None
    return row[0]


# ---------------------------------------------------------- scraped_listings

def upsert_scraped_listing(
    conn: psycopg.Connection,
    raw_dump_id: uuid.UUID,
    norm: Normalized,
    seen_at: datetime,
) -> tuple[uuid.UUID, int | None, int | None]:
    """Normalize kaydı upsert eder.

    Döndürür: (scraped_listing_id, eski_fiyat, yeni_fiyat)
      eski_fiyat None → kayıt yeni (ilk gözlem)
    Yeniden görülen kayıtta delisted_at sıfırlanır (ilan geri yayına girmiş).
    """
    row = conn.execute(
        """
        WITH old AS (
          SELECT price_azn FROM scraped_listings
          WHERE source_site = %(site)s AND source_ext_id = %(ext)s
        ), up AS (
          INSERT INTO scraped_listings
            (raw_dump_id, source_site, source_ext_id, vertical, normalized,
             price_azn, first_seen_at, last_seen_at)
          VALUES (%(dump)s, %(site)s, %(ext)s, %(vertical)s, %(norm)s,
                  %(price)s, %(seen)s, %(seen)s)
          ON CONFLICT (source_site, source_ext_id) DO UPDATE SET
            raw_dump_id  = EXCLUDED.raw_dump_id,
            normalized   = EXCLUDED.normalized,
            price_azn    = EXCLUDED.price_azn,
            last_seen_at = GREATEST(scraped_listings.last_seen_at, EXCLUDED.last_seen_at),
            delisted_at  = NULL
          RETURNING id, price_azn
        )
        SELECT up.id, old.price_azn, up.price_azn
        FROM up LEFT JOIN old ON TRUE
        """,
        {
            "dump": raw_dump_id,
            "site": norm.source_site,
            "ext": norm.source_ext_id,
            "vertical": norm.vertical,
            "norm": Jsonb(norm.model_dump(mode="json")),
            "price": norm.price_azn,
            "seen": seen_at,
        },
    ).fetchone()
    assert row is not None
    return row[0], row[1], row[2]


# ----------------------------------------------------------- price_snapshots

def record_price_if_changed(
    conn: psycopg.Connection,
    scraped_listing_id: uuid.UUID,
    old_price: int | None,
    new_price: int | None,
    observed_at: datetime,
    source_site: str,
) -> bool:
    """İlk gözlem veya fiyat değişimi → hypertable'a satır. True = satır düştü."""
    if new_price is None or old_price == new_price:
        return False
    conn.execute(
        """
        INSERT INTO price_snapshots (ref_kind, ref_id, observed_at, price_azn, source)
        VALUES ('scraped', %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        """,
        (scraped_listing_id, observed_at, new_price, source_site),
    )
    return True


# -------------------------------------------------------------- delist tespiti

def mark_delisted(
    conn: psycopg.Connection,
    source_site: str,
    seen_ext_ids: set[str],
    as_of: datetime | None = None,
) -> int:
    """FULL koşuda görünmeyen aktif kayıtlara delisted_at damgalar.

    Bu damga "satıldı/kaldırıldı" sinyalinin ham halidir — model eğitiminin
    en değerli etiketi. Yalnızca full taramadan sonra çağrılmalıdır; delta
    koşular kapsam eksikliğinden yanlış pozitif üretir.
    """
    as_of = as_of or datetime.now(timezone.utc)
    cur = conn.execute(
        """
        UPDATE scraped_listings
        SET delisted_at = %s
        WHERE source_site = %s
          AND delisted_at IS NULL
          AND NOT (source_ext_id = ANY(%s))
        """,
        (as_of, source_site, list(seen_ext_ids)),
    )
    return cur.rowcount or 0
