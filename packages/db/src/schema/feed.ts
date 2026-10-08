import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { dealType, propertyType } from "./enums";

/**
 * Mülkiyyətçi lenti — başka sitelerde SAHİBİNİN verdiği ilanlara yönlendirme.
 *
 * scraped_listings'ten (model eğitimi) ve listings'ten (pribor.az ilanları)
 * bilinçli olarak ayrı: bu kayıtlar pribor.az'da içerik olarak YAYINLANMAZ,
 * yalnız kart olarak gösterilir ve tıklayan kaynaktaki asıl ilana gider.
 * Bu yüzden burada yalnız olgusal alanlar tutulur (fiyat, otaq, sahə, yer,
 * tarih) — foto, açıklama metni, satıcı adı ve telefonu TUTULMAZ.
 *
 * Toplayan: services/scraper/pribor_scraper/owner_feed.py
 */
export const ownerFeed = pgTable(
  "owner_feed",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSite: varchar("source_site", { length: 40 }).notNull(),
    sourceExtId: varchar("source_ext_id", { length: 80 }).notNull(),
    /** Kaynaktaki asıl ilan — kart buraya gider. */
    url: varchar("url", { length: 300 }).notNull(),
    dealType: dealType("deal_type").notNull(),
    propertyType: propertyType("property_type").notNull(),
    rooms: smallint("rooms"),
    areaM2: numeric("area_m2", { precision: 8, scale: 1 }),
    landAreaSot: numeric("land_area_sot", { precision: 8, scale: 1 }),
    floor: smallint("floor"),
    totalFloors: smallint("total_floors"),
    priceAzn: integer("price_azn").notNull(),
    district: varchar("district", { length: 60 }),
    settlement: varchar("settlement", { length: 80 }),
    hasRepair: boolean("has_repair"),
    titleDeed: boolean("title_deed"),
    /**
     * İlk yayın tarihi (tahmini). Kaynaklar bunu vermiyor; foto yükleme
     * yolundaki tarihten okunur — "irəli çəkilmiş" eski ilan yeni görünmesin.
     */
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    /** Satıcı hesabının tek yönlü özeti — sayım için; kimliğin kendisi tutulmaz. */
    sellerKey: varchar("seller_key", { length: 64 }),
    /** owner = gösterilir · agent / duplicate = gizli (neden: reasons). */
    verdict: varchar("verdict", { length: 16 }).notNull(),
    /** Kararın gerekçeleri — örn. ["hesab_elan_sayi:48", "beyan:vasiteci"]. */
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Kaynakta artık görünmüyor (satıldı/silindi) — karttan kalkar. */
    delistedAt: timestamp("delisted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("owner_feed_site_ext_uq").on(t.sourceSite, t.sourceExtId),
    index("owner_feed_visible_idx").on(t.verdict, t.postedAt),
  ],
);
