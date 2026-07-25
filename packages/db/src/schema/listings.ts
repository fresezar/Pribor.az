import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  buildingType,
  fuelType,
  listingSource,
  listingStatus,
  mediaKind,
  priceRefKind,
  propertyType,
  transmission,
  vertical,
} from "./enums";
import { locations } from "./locations";
import { organizations, users } from "./users";

/**
 * Polimorfik ilan omurgası: ortak alanlar burada, dikeye özgü öznitelikler
 * listing_re_attrs / listing_vehicle_attrs uzantı tablolarında (1:1).
 * Üçüncü bir dikey eklemek = yeni uzantı tablosu + vertical enum değeri.
 */
export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * İnsan-okur ilan numarası (UI'da "PRB-10042"). Identity kolonu —
     * Postgres sırayı kendi yönetir; arama ve müşteri desteği bu numarayla.
     */
    refNo: integer("ref_no").generatedByDefaultAsIdentity({ startWith: 10000 }),
    vertical: vertical("vertical").notNull(),
    status: listingStatus("status").notNull().default("draft"),
    source: listingSource("source").notNull().default("user"),
    /** Scraped ilanlarda null olabilir; kullanıcı ilanında zorunluluk uygulama katmanında. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => locations.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    priceAzn: integer("price_azn").notNull(),
    /** İlanda GÖRÜNEN iletişim bilgisi (alıcı bunu görür). */
    contactName: varchar("contact_name", { length: 120 }),
    contactPhone: varchar("contact_phone", { length: 20 }),
    /**
     * DOĞRULAMA numarası — OTP bu numaraya gider, haftalık ilan limiti buna
     * göre sayılır. İlanda GİZLİ kalır; iletişim numarasından farklı olabilir.
     * (Mevcut satırlar için nullable; yeni ilanlarda uygulama katmanı zorunlu kılar.)
     */
    verificationPhone: varchar("verification_phone", { length: 20 }),
    /**
     * İlan fotoğrafları. MVP: data URI dizisi (istemci tarafında küçültülmüş
     * JPEG). Prod: R2/MinIO'ya yüklenip media tablosuna storage_key yazılır,
     * burada yalnızca CDN URL'leri tutulur — geçiş yolu media tablosu üzerinden.
     */
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    /** Örtük şəkli — photos dizisindeki kapak fotoğrafının indeksi. */
    coverPhotoIdx: smallint("cover_photo_idx").notNull().default(0),
    /** Değerleme köprüsü: ilan bir değerlemeden doğduysa buradan izlenir. */
    valuationId: uuid("valuation_id"),
    /** Şemaya girmemiş serbest alanlar için taşma sahası — kolonlaşma adayları burada birikir. */
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    boostedUntil: timestamp("boosted_until", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("listings_status_vertical_idx").on(t.status, t.vertical),
    index("listings_location_idx").on(t.locationId),
    index("listings_user_idx").on(t.userId),
    index("listings_published_idx").on(t.publishedAt),
    uniqueIndex("listings_ref_no_uq").on(t.refNo),
    // Haftalık telefon-bazlı limit sorgusu: (verification_phone, created_at)
    index("listings_vphone_created_idx").on(t.verificationPhone, t.createdAt),
    check("listings_price_positive", sql`${t.priceAzn} > 0`),
  ],
);

/** Gayrimenkul öznitelikleri — model feature'larının birincil kaynağı. */
export const listingReAttrs = pgTable(
  "listing_re_attrs",
  {
    listingId: uuid("listing_id")
      .primaryKey()
      .references(() => listings.id, { onDelete: "cascade" }),
    propertyType: propertyType("property_type").notNull(),
    areaM2: numeric("area_m2", { precision: 8, scale: 1 }),
    /** Torpaq sahəsi — Bakü'de arsa "sot" ile ölçülür (1 sot = 100 m²). */
    landAreaSot: numeric("land_area_sot", { precision: 8, scale: 1 }),
    rooms: smallint("rooms"),
    floor: smallint("floor"),
    totalFloors: smallint("total_floors"),
    buildingType: buildingType("building_type"),
    /** Təmir vəziyyəti 0..5 ordinal — sözlük eşlemesi contracts/enums.ts'te. */
    repairState: smallint("repair_state"),
    /** Kupça / çıxarış var mı? Bakü pazarının kritik fiyat değişkeni. */
    titleDeed: boolean("title_deed"),
    /** İpotekaya yararlıdır? */
    mortgageEligible: boolean("mortgage_eligible"),
  },
  (t) => [
    check("re_repair_state_range", sql`${t.repairState} between 0 and 5`),
    index("re_attrs_type_rooms_idx").on(t.propertyType, t.rooms),
  ],
);

/** Otomotiv öznitelikleri. */
export const listingVehicleAttrs = pgTable(
  "listing_vehicle_attrs",
  {
    listingId: uuid("listing_id")
      .primaryKey()
      .references(() => listings.id, { onDelete: "cascade" }),
    make: varchar("make", { length: 60 }).notNull(),
    model: varchar("model", { length: 60 }).notNull(),
    year: smallint("year").notNull(),
    mileageKm: integer("mileage_km"),
    engineL: numeric("engine_l", { precision: 3, scale: 1 }),
    fuelType: fuelType("fuel_type"),
    transmission: transmission("transmission"),
    bodyType: varchar("body_type", { length: 40 }),
    color: varchar("color", { length: 30 }),
    /** Vuruğu / rənglənməsi yoxdur. */
    accidentFree: boolean("accident_free"),
    /** Gömrükdən keçib — ithal araç fiyatının kilit değişkeni. */
    customsCleared: boolean("customs_cleared"),
    vin: varchar("vin", { length: 17 }),
  },
  (t) => [index("veh_attrs_make_model_year_idx").on(t.make, t.model, t.year)],
);

/**
 * Fiyat geçmişi — TimescaleDB hypertable (dönüşüm: packages/db/sql/timescale.sql).
 * Hem kendi ilanlarımızın (ref_kind='listing') hem scraped kayıtların
 * (ref_kind='scraped') fiyat gözlemleri buraya akar; semt endeksleri ve
 * "3 haftada 2 indirim" içgörüsü buradan üretilir.
 *
 * ref_id bilinçli olarak FK DEĞİLDİR: hedef tablo ref_kind'a göre değişir
 * (polimorfik) ve hypertable'lar FK bakımını pahalılaştırır. Bütünlük,
 * tek yazıcı olan ingest katmanında (services/scraper/pribor_scraper/db.py)
 * ve uygulama servislerinde korunur.
 */
export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    refKind: priceRefKind("ref_kind").notNull().default("listing"),
    /** listings.id (ref_kind='listing') veya scraped_listings.id (ref_kind='scraped') */
    refId: uuid("ref_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    priceAzn: integer("price_azn").notNull(),
    /** 'user' | site kodu — gözlemin kaynağı */
    source: varchar("source", { length: 40 }).notNull().default("user"),
  },
  (t) => [
    // Hypertable şartı: PK partition kolonu (observed_at) içermeli
    primaryKey({ columns: [t.refKind, t.refId, t.observedAt] }),
  ],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull().default("photo"),
    /** R2/MinIO nesne anahtarı — URL değil; CDN URL'i uygulama katmanında türetilir. */
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    width: smallint("width"),
    height: smallint("height"),
    orderIdx: smallint("order_idx").notNull().default(0),
    /** Perceptual hash — çapraz ilan foto tekilleştirmenin sinyali. */
    phash: varchar("phash", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("media_listing_idx").on(t.listingId, t.orderIdx),
    index("media_phash_idx").on(t.phash),
  ],
);
