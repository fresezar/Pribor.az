import {
  geometry,
  index,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * PostGIS notu: kolonlar geometry(Point, 4326) olarak tutulur (Drizzle native
 * desteği). Mesafe hesabında geography'e cast edilir — metre cinsinden doğru
 * sonuç için sorgu kalıbı:
 *
 *   SELECT ST_Distance(l.point::geography, m.point::geography) AS dist_m
 *   FROM locations l, metro_stations m WHERE m.id = ...
 *
 * "En yakın metro" için GIST indeksli KNN operatörü: ORDER BY l.point <-> m.point
 */

export const metroStations = pgTable(
  "metro_stations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameAz: varchar("name_az", { length: 80 }).notNull(),
    nameRu: varchar("name_ru", { length: 80 }),
    line: varchar("line", { length: 40 }),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 }).notNull(),
  },
  (t) => [
    uniqueIndex("metro_name_az_uq").on(t.nameAz),
    index("metro_point_gist").using("gist", t.point),
  ],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    city: varchar("city", { length: 60 }).notNull().default("Bakı"),
    /** Rayon — kanonik liste @pribor/contracts BakuDistrict ile senkron. */
    district: varchar("district", { length: 60 }),
    /** Qəsəbə/mikrorayon: Günəşli, Əhmədli, Bakıxanov, Masazır... */
    settlement: varchar("settlement", { length: 80 }),
    addressLine: varchar("address_line", { length: 255 }),
    point: geometry("point", { type: "point", mode: "xy", srid: 4326 }),
    /** İşleme hattının hesapladığı en yakın istasyon + metre cinsinden mesafe. */
    nearestMetroId: uuid("nearest_metro_id").references(() => metroStations.id),
    metroDistM: smallint("metro_dist_m"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("locations_district_idx").on(t.district),
    index("locations_point_gist").using("gist", t.point),
  ],
);
