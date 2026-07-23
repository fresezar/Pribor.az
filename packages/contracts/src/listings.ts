import { z } from "zod";

/** Elanlar/Bazar görünümündeki sıralama seçenekleri. */
export const ListingSort = z.enum([
  "newest", // Ən yeni
  "price_asc", // Qiymət: ucuzdan bahaya
  "price_desc", // Qiymət: bahadan ucuza
  "deal", // Dəyərindən ucuz — Pribor Fırsat Skoru
  "area_desc", // Sahəyə görə (böyükdən kiçiyə)
]);
export type ListingSort = z.infer<typeof ListingSort>;

/** Elanlar listesi sorgu parametreleri (GET /v1/listings). */
export const ListingQuery = z.object({
  sort: ListingSort.default("newest"),
  district: z.string().optional(),
  rooms: z.coerce.number().int().min(1).max(20).optional(),
  propertyType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListingQuery = z.infer<typeof ListingQuery>;

/**
 * Piyasa görünümü ilan kartı. dealPct: ilanın m² fiyatının semt medyan m²
 * fiyatına göre farkı (negatif = fırsat, medyanın altında). Fırsat Skoru
 * sıralaması bu alana göre artan (en negatif önce) yapılır.
 */
export const ListingCard = z.object({
  id: z.string().uuid(),
  title: z.string(),
  district: z.string().nullable(),
  settlement: z.string().nullable(),
  propertyType: z.string().nullable(),
  rooms: z.number().int().nullable(),
  areaM2: z.number().nullable(),
  repairState: z.number().int().nullable(),
  buildingType: z.string().nullable(),
  titleDeed: z.boolean().nullable(),
  metroStation: z.string().nullable(),
  priceAzn: z.number().int(),
  pricePerM2: z.number().int().nullable(),
  /** Semt medyanına göre m² sapması (%). null = medyan/m² yok. */
  dealPct: z.number().nullable(),
  sourceSite: z.string(),
  firstSeenAt: z.string(),
});
export type ListingCard = z.infer<typeof ListingCard>;

export const ListingsResponse = z.object({
  items: z.array(ListingCard),
  total: z.number().int(),
  sort: ListingSort,
});
export type ListingsResponse = z.infer<typeof ListingsResponse>;
