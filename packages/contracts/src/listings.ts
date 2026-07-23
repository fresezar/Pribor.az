import { z } from "zod";
import { BakuDistrict, BuildingType, RepairState } from "./enums";
import { RealEstatePropertyType } from "./valuation";

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

/**
 * Kullanıcının ilan verme akışı. Değerlemeden gelen alanlar ön-doldurulur;
 * priceAzn kullanıcının düzenlemesine açıktır (varsayılan P50). Fotoğraflar
 * MVP'de data URI dizisidir (en fazla 5), açıqlama serbest metindir.
 *
 * userId mock auth'tan gelir — Faz 3'te JWT oturumuyla değişir; şimdilik
 * istemci gönderir (güvenlik sınırı bilinçli olarak MVP seviyesindedir).
 */
export const CreateListingDto = z.object({
  userId: z.string().uuid(),
  valuationId: z.string().uuid().optional(),
  propertyType: RealEstatePropertyType,
  district: BakuDistrict,
  areaM2: z.number().positive().max(100_000).optional(),
  landAreaSot: z.number().positive().max(10_000).optional(),
  rooms: z.number().int().min(1).max(20).optional(),
  buildingType: BuildingType.optional(),
  repairState: RepairState.optional(),
  titleDeed: z.boolean().optional(),
  metroDistM: z.number().int().nonnegative().optional(),
  /** Kullanıcının düzenlediği fiyat (varsayılan değerleme P50'si). */
  priceAzn: z.number().int().positive().max(1_000_000_000),
  description: z.string().max(4000).optional(),
  /** data URI dizisi (MVP) — en fazla 5. */
  photos: z.array(z.string().max(3_000_000)).max(5).default([]),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(20).optional(),
});
export type CreateListingDto = z.infer<typeof CreateListingDto>;

/** "Mənim elanlarım" kartı. */
export const UserListing = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.string(),
  propertyType: z.string().nullable(),
  district: z.string().nullable(),
  rooms: z.number().int().nullable(),
  areaM2: z.number().nullable(),
  priceAzn: z.number().int(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  createdAt: z.string(),
});
export type UserListing = z.infer<typeof UserListing>;

/** İlan limiti aşıldığında dönen hata gövdesi (frontend upgrade modalını açar). */
export const LISTING_LIMIT_CODE = "LISTING_LIMIT_EXCEEDED" as const;
