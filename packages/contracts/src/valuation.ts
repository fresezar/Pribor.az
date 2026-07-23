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

/** Gayrimenkul değerleme girdisi — sihirbaz akışının topladığı alanlar. */
export const RealEstateValuationInput = z.object({
  vertical: z.literal("real_estate"),
  propertyType: PropertyType,
  district: BakuDistrict,
  /** Opsiyonel hassas konum — verilirse metro mesafesi sunucuda hesaplanır. */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  areaM2: z.number().positive().max(10_000),
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
