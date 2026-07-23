import { z } from "zod";

/**
 * Sözlük değerleri DB enum'larıyla birebir aynıdır (packages/db/src/schema/enums.ts).
 * Yeni değer eklerken iki tarafı birlikte güncelle — tek doğruluk kaynağı bu ikili.
 */

export const Vertical = z.enum(["real_estate", "vehicle"]);
export type Vertical = z.infer<typeof Vertical>;

export const ListingStatus = z.enum([
  "draft",
  "pending_review",
  "active",
  "sold",
  "expired",
  "removed",
]);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const PropertyType = z.enum([
  "apartment",
  "house",
  "land",
  "commercial",
  "office",
  "garage",
]);
export type PropertyType = z.infer<typeof PropertyType>;

export const BuildingType = z.enum(["yeni_tikili", "kohne_tikili", "stalinka"]);
export type BuildingType = z.infer<typeof BuildingType>;

/**
 * Təmir vəziyyəti — 0..5 sıralı (ordinal) ölçek.
 * 0: qara tikili / черновая · 1: təmirsiz · 2: köhnə təmir
 * 3: orta təmir · 4: yaxşı təmir · 5: əla / dizayner təmiri
 */
export const RepairState = z.number().int().min(0).max(5);
export type RepairState = z.infer<typeof RepairState>;

export const FuelType = z.enum(["petrol", "diesel", "gas", "hybrid", "electric"]);
export type FuelType = z.infer<typeof FuelType>;

export const Transmission = z.enum(["manual", "automatic", "robot", "variator"]);
export type Transmission = z.infer<typeof Transmission>;

export const ValuationChannel = z.enum(["web", "mobile", "telegram", "api"]);
export type ValuationChannel = z.infer<typeof ValuationChannel>;

/** Bakü rayonları — locations.district için kanonik liste. */
export const BakuDistrict = z.enum([
  "Binəqədi",
  "Xətai",
  "Xəzər",
  "Qaradağ",
  "Nərimanov",
  "Nəsimi",
  "Nizami",
  "Pirallahı",
  "Sabunçu",
  "Səbail",
  "Suraxanı",
  "Yasamal",
  "Abşeron",
]);
export type BakuDistrict = z.infer<typeof BakuDistrict>;
