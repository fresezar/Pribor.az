import { z } from "zod";
import type { BuildingType, PropertyType } from "./enums";

/**
 * Bakü pazarı emlak kategorileri (UI'da gösterilen 7 seçenek). Bunlar
 * DB'deki propertyType + buildingType ikilisinden TÜRETİLİR — ayrı kolon yok:
 *   yeni_tikili  → apartment + yeni_tikili
 *   kohne_tikili → apartment + kohne_tikili
 *   heyet_evi    → house
 *   ofis         → office
 *   qaraj        → garage
 *   torpaq       → land
 *   obyekt       → commercial
 */
export const ReCategory = z.enum([
  "yeni_tikili",
  "kohne_tikili",
  "heyet_evi",
  "ofis",
  "qaraj",
  "torpaq",
  "obyekt",
]);
export type ReCategory = z.infer<typeof ReCategory>;

/** İlan növü: satış (Satılır) veya kirayə (Kirayə). */
export const DealType = z.enum(["sale", "rent"]);
export type DealType = z.infer<typeof DealType>;

export const RE_CATEGORY_LABEL: Record<ReCategory, string> = {
  yeni_tikili: "Yeni tikili",
  kohne_tikili: "Köhnə tikili",
  heyet_evi: "Həyət evi/Bağ evi",
  ofis: "Ofis",
  qaraj: "Qaraj",
  torpaq: "Torpaq",
  obyekt: "Obyekt",
};

export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  sale: "Satılır",
  rent: "Kirayə",
};

/** Kategori → model/DB tipi. buildingType yalnızca mənzil kategorilerinde. */
export function categoryToType(c: ReCategory): {
  propertyType: PropertyType;
  buildingType?: BuildingType;
} {
  switch (c) {
    case "yeni_tikili":
      return { propertyType: "apartment", buildingType: "yeni_tikili" };
    case "kohne_tikili":
      return { propertyType: "apartment", buildingType: "kohne_tikili" };
    case "heyet_evi":
      return { propertyType: "house" };
    case "ofis":
      return { propertyType: "office" };
    case "qaraj":
      return { propertyType: "garage" };
    case "torpaq":
      return { propertyType: "land" };
    case "obyekt":
      return { propertyType: "commercial" };
  }
}

/** DB tipi → kategori (kart/detay etiketleri, scraped veri için). */
export function typeToCategory(
  propertyType: string | null | undefined,
  buildingType?: string | null,
): ReCategory {
  switch (propertyType) {
    case "apartment":
      return buildingType === "yeni_tikili" ? "yeni_tikili" : "kohne_tikili";
    case "house":
      return "heyet_evi";
    case "office":
      return "ofis";
    case "garage":
      return "qaraj";
    case "land":
      return "torpaq";
    case "commercial":
      return "obyekt";
    default:
      return "kohne_tikili";
  }
}

export const categoryLabel = (
  propertyType: string | null | undefined,
  buildingType?: string | null,
): string => RE_CATEGORY_LABEL[typeToCategory(propertyType, buildingType)];
