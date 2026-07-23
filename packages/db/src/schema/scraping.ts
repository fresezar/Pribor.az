import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { scrapeRunStatus, scrapeRunType, vertical } from "./enums";
import { listings } from "./listings";

/**
 * Veri toplama düzleminin muhasebesi. İlke: ham veri KUTSALDIR —
 * payload'ın kendisi R2/MinIO'da immutable JSONL olarak durur, DB yalnızca
 * işaretçi (storage_key) ve muhasebe tutar. Temizleme mantığı değişince
 * tüm tarih yeniden işlenebilir.
 */

/** Her scraper koşusu bir satır — gözlemlenebilirlik ve şema sağlığı alarmları buradan. */
export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSite: varchar("source_site", { length: 60 }).notNull(),
    runType: scrapeRunType("run_type").notNull(),
    status: scrapeRunStatus("status").notNull().default("running"),
    /** {"pages": 120, "items": 3540, "new": 210, "errors": 3, "parse_fail_rate": 0.01} */
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("scrape_runs_site_started_idx").on(t.sourceSite, t.startedAt)],
);

/**
 * Ham döküm işaretçileri. content_hash aynı ilanın değişmemiş kopyalarını
 * ayıklar: (source_site, source_ext_id, content_hash) benzersizdir —
 * içerik değiştiyse yeni satır düşer, tarih asla ezilmez.
 */
export const rawDumps = pgTable(
  "raw_dumps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: "cascade" }),
    sourceSite: varchar("source_site", { length: 60 }).notNull(),
    /** Kaynak sitenin kendi ilan kimliği. */
    sourceExtId: varchar("source_ext_id", { length: 80 }).notNull(),
    url: varchar("url", { length: 500 }).notNull(),
    httpStatus: integer("http_status"),
    /** R2/MinIO'daki JSONL nesnesi + satır ofseti, örn. "raw/site-a/2026-07-23/<run>.jsonl#L142" */
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    /** Payload'ın SHA-256'sı — değişim tespiti + bütünlük. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("raw_dumps_site_ext_hash_uq").on(t.sourceSite, t.sourceExtId, t.contentHash),
    index("raw_dumps_run_idx").on(t.runId),
  ],
);

/**
 * Normalize edilmiş staging katmanı: temizleme hattının çıktısı.
 * Model eğitimi ve piyasa endeksleri bu tablodan; dedup_cluster_id
 * "aynı mülk, 5 ilan" kümelerini bağlar.
 */
export const scrapedListings = pgTable(
  "scraped_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawDumpId: uuid("raw_dump_id")
      .notNull()
      .references(() => rawDumps.id),
    sourceSite: varchar("source_site", { length: 60 }).notNull(),
    sourceExtId: varchar("source_ext_id", { length: 80 }).notNull(),
    vertical: vertical("vertical").notNull(),
    /** Normalizasyon çıktısı — NormalizedRealEstate / NormalizedVehicle şekli. */
    normalized: jsonb("normalized").$type<Record<string, unknown>>().notNull(),
    priceAzn: integer("price_azn"),
    /** MinHash + pHash + telefon kümeleme kimliği. */
    dedupClusterId: varchar("dedup_cluster_id", { length: 64 }),
    /** Platformdaki bir kullanıcı ilanıyla eşleştiyse köprü. */
    matchedListingId: uuid("matched_listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    /** Yayından kalkış — "satıldı" sinyalinin ham hali; modelin en değerli etiketi. */
    delistedAt: timestamp("delisted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("scraped_site_ext_uq").on(t.sourceSite, t.sourceExtId),
    index("scraped_vertical_seen_idx").on(t.vertical, t.lastSeenAt),
    index("scraped_dedup_idx").on(t.dedupClusterId),
  ],
);
