-- ============================================================
-- TimescaleDB kurulumu — Drizzle migration'larından SONRA bir kez çalıştırılır.
--   docker compose exec -T db psql -U pribor -d pribor < packages/db/sql/timescale.sql
-- Drizzle bu dosyayı yönetmez; hypertable DDL'i bilinçli olarak ayrı tutulur.
-- ============================================================

-- price_snapshots → hypertable (7 günlük chunk'lar)
SELECT create_hypertable(
  'price_snapshots',
  'observed_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- 90 günden eski chunk'ları sıkıştır (ilan başına sıralı, zamana göre ters)
ALTER TABLE price_snapshots SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'listing_id',
  timescaledb.compress_orderby = 'observed_at DESC'
);

SELECT add_compression_policy('price_snapshots', INTERVAL '90 days', if_not_exists => TRUE);

-- Semt endeksi için sürekli toplam (continuous aggregate):
-- günlük medyan m² fiyatı vb. Faz 1'de scraped veri akmaya başlayınca açılır.
-- Örnek iskelet (şimdilik yorum satırı):
--
-- CREATE MATERIALIZED VIEW IF NOT EXISTS price_daily_district
-- WITH (timescaledb.continuous) AS
-- SELECT time_bucket('1 day', ps.observed_at) AS bucket,
--        l.location_id,
--        percentile_cont(0.5) WITHIN GROUP (ORDER BY ps.price_azn) AS median_price
-- FROM price_snapshots ps
-- JOIN listings l ON l.id = ps.listing_id
-- GROUP BY bucket, l.location_id;
