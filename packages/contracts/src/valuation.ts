import { z } from "zod";
import {
  BakuDistrict,
  BuildingType,
  FuelType,
  PropertyType,
  RepairState,
  Transmission,
  ValuationChannel,
} from "./enums";

/** Gayrimenkul dikeyinde MVP'de değerlenen emlak tipleri (UI'da gösterilenler). */
export const RealEstatePropertyType = z.enum(["apartment", "house", "land"]);
export type RealEstatePropertyType = z.infer<typeof RealEstatePropertyType>;

/** Gayrimenkul değerleme girdisi — sihirbaz akışının topladığı alanlar. */
export const RealEstateValuationInput = z.object({
  vertical: z.literal("real_estate"),
  propertyType: PropertyType,
  district: BakuDistrict,
  /** Opsiyonel hassas konum — verilirse metro mesafesi sunucuda hesaplanır. */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /**
   * Değerlenen ana sahə (m²):
   *  - apartment: mənzil sahəsi
   *  - house (həyət evi): tikili (bina) sahəsi
   *  - land (torpaq): sahə m² cinsinden (istemci sot×100 ile türetir)
   */
  areaM2: z.number().positive().max(100_000),
  /** Torpaq sahəsi (sot) — house ve land için; apartment'ta boş. 1 sot = 100 m². */
  landAreaSot: z.number().positive().max(10_000).optional(),
  rooms: z.number().int().min(1).max(20).optional(),
  floor: z.number().int().min(-2).max(60).optional(),
  totalFloors: z.number().int().min(1).max(60).optional(),
  buildingType: BuildingType.optional(),
  repairState: RepairState.optional(),
  /** Kupça / çıxarış — Bakü pazarında birinci sınıf fiyat değişkeni. */
  titleDeed: z.boolean().optional(),
  metroDistM: z.number().int().nonnegative().optional(),
});
export type RealEstateValuationInput = z.infer<typeof RealEstateValuationInput>;

/** Otomotiv değerleme girdisi. */
export const VehicleValuationInput = z.object({
  vertical: z.literal("vehicle"),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1950).max(2100),
  mileageKm: z.number().int().nonnegative().max(2_000_000),
  engineL: z.number().positive().max(12).optional(),
  fuelType: FuelType.optional(),
  transmission: Transmission.optional(),
  accidentFree: z.boolean().optional(),
  /** Gömrükdən keçib? — ithal araç fiyatının kilit değişkeni. */
  customsCleared: z.boolean().optional(),
});
export type VehicleValuationInput = z.infer<typeof VehicleValuationInput>;

export const ValuationRequest = z.discriminatedUnion("vertical", [
  RealEstateValuationInput,
  VehicleValuationInput,
]);
export type ValuationRequest = z.infer<typeof ValuationRequest>;

/** SHAP katkısı — "Qiymət DNT-si" satırının veri kaynağı. */
export const ShapContribution = z.object({
  /** Makine adı, örn. "metro_dist_m" */
  feature: z.string(),
  /** Kullanıcı diline çevrilmiş etiket, örn. "Metro yaxınlığı" */
  label: z.string(),
  /** İşaretli katkı, AZN. Pozitif = fiyatı yükseltti. */
  contributionAzn: z.number(),
});
export type ShapContribution = z.infer<typeof ShapContribution>;

export const ValuationResult = z.object({
  valuationId: z.string().uuid(),
  vertical: z.enum(["real_estate", "vehicle"]),
  /** Kalibre quantile tahminleri — tek sayı değil, dürüst aralık. */
  p10Azn: z.number().int().nonnegative(),
  p50Azn: z.number().int().nonnegative(),
  p90Azn: z.number().int().nonnegative(),
  /** 0..1 — comps yoğunluğu ve aralık genişliğinden türetilen güven skoru. */
  confidence: z.number().min(0).max(1),
  shapTop: z.array(ShapContribution).max(8),
  /** Kıyas ilanı kimlikleri — sonuç ekranındaki "kanıt" kartları. */
  compListingIds: z.array(z.string().uuid()).max(10),
  modelVersion: z.string(),
  createdAt: z.string().datetime(),
});
export type ValuationResult = z.infer<typeof ValuationResult>;

export const CreateValuationDto = z.object({
  input: ValuationRequest,
  channel: ValuationChannel.default("web"),
});
export type CreateValuationDto = z.infer<typeof CreateValuationDto>;

/**
 * Emsal ilan (comp) — sonuç ekranındaki "kanıt" kartı. NestJS,
 * scraped_listings'ten öznitelik yakınlığıyla getirir; deltaPct, ilanın
 * m² fiyatının kullanıcının değerleme m² fiyatına göre farkıdır
 * (negatif = emsal daha ucuz).
 */
export const CompListing = z.object({
  id: z.string().uuid(),
  title: z.string(),
  district: z.string().nullable(),
  propertyType: z.string().nullable(),
  rooms: z.number().int().nullable(),
  areaM2: z.number().nullable(),
  priceAzn: z.number().int(),
  pricePerM2: z.number().int().nullable(),
  /** m² bazında emsal vs değerleme farkı (%). null = m² hesaplanamadı. */
  deltaPct: z.number().nullable(),
  sourceSite: z.string(),
});
export type CompListing = z.infer<typeof CompListing>;

/**
 * İstemcinin gördüğü zenginleştirilmiş yanıt: ML sonucu + DB'den comps +
 * piyasa bağlamı. ValuationResult ML sözleşmesidir; bu, NestJS'in üzerine
 * kattığı katmandır (ML DB'ye dokunmaz).
 */
export const ValuationResponse = ValuationResult.extend({
  comps: z.array(CompListing).max(8).default([]),
  /** Semt medyan m² fiyatı (scraped_listings'ten) — "bazar" kıyas çıpası. */
  marketMedianPricePerM2: z.number().int().nullable().default(null),
});
export type ValuationResponse = z.infer<typeof ValuationResponse>;
