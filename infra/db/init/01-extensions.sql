-- Docker ilk açılışında bir kez çalışır (docker-entrypoint-initdb.d).
-- Drizzle migration'ları bu uzantıların varlığını varsayar.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
