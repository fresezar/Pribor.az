import { z } from "zod";
import { DealType } from "./category";

/**
 * Mülkiyyətçi lenti — başka sitelerde sahibinin verdiği ilanlara yönlendirme
 * kartları (GET /v1/owner-feed). İçerik kaynağında kalır: kartta foto ve
 * açıklama yok, tıklayan `url`'deki asıl ilana gider.
 */
export const OwnerFeedQuery = z.object({
  /** Qəsəbə — şimdilik yalnız "Binə" toplanıyor. */
  settlement: z.string().max(80).optional(),
  dealType: DealType.optional(),
  propertyType: z.enum(["apartment", "house", "land"]).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  offset: z.coerce.number().int().min(0).default(0),
});
export type OwnerFeedQuery = z.infer<typeof OwnerFeedQuery>;

export const OwnerFeedCard = z.object({
  id: z.string().uuid(),
  sourceSite: z.string(),
  url: z.string().url(),
  dealType: DealType,
  propertyType: z.string(),
  rooms: z.number().int().nullable(),
  areaM2: z.number().nullable(),
  landAreaSot: z.number().nullable(),
  floor: z.number().int().nullable(),
  totalFloors: z.number().int().nullable(),
  priceAzn: z.number().int(),
  district: z.string().nullable(),
  settlement: z.string().nullable(),
  hasRepair: z.boolean().nullable(),
  titleDeed: z.boolean().nullable(),
  postedAt: z.string(),
});
export type OwnerFeedCard = z.infer<typeof OwnerFeedCard>;

export const OwnerFeedResponse = z.object({
  items: z.array(OwnerFeedCard),
  total: z.number().int(),
  /** Aynı pencerede emlakçı/təkrar diye gizlenen ilan sayısı — şeffaflık için. */
  hidden: z.number().int(),
  /** Son toplama zamanı (ISO) — lent ne kadar taze. */
  updatedAt: z.string().nullable(),
});
export type OwnerFeedResponse = z.infer<typeof OwnerFeedResponse>;

/** Lent penceresi — bu günden eski ilanlar gösterilmez. */
export const OWNER_FEED_DAYS = 60;
