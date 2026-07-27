import type { ReCategory } from "@pribor/contracts";
import { RE_CATEGORY_LABEL } from "@pribor/contracts";

/**
 * İstemci kategori yapılandırması — 7 emlak kategorisi için etiket, ikon,
 * renk kodu ve HANGİ ALANLARIN görüneceği. Hem valuation hem listing formu
 * bu tek kaynağı kullanır. Kategori → (propertyType, buildingType) eşlemesi
 * @pribor/contracts.categoryToType ile yapılır.
 */

export type CategoryConfig = {
  key: ReCategory;
  label: string;
  icon: string;
  /** Kart/rozet renk değişkeni (emlak tipi renk kodları). */
  colorVar: string;
  rooms: boolean;      // otaq sayısı
  areaM2: boolean;     // sahə (m²) — tikili/bina alanı
  landSot: boolean;    // torpaq sahəsi (sot)
  repair: boolean;     // təmir vəziyyəti
  metro: boolean;      // metroya məsafə
  /** Sahə etiketi (kategoriye göre değişir). */
  areaLabel: string;
  /**
   * Qiymətləndirmə motoru bu kategoriyi hesaplayabilir mi?
   *
   * İLAN VERME hepsinde açık — kapalı olan yalnız DEĞERLEME. Model şu an
   * mənzil ve həyət evi üzerinde ölçülmüş doğrulukta (medyan hata %9.7 ve
   * %17.9). Diğerleri:
   *   torpaq  — eğitiliyor ama medyan hata %36; arsa fiyatını ayıran şey
   *             (təyinat, yol cephesi, imar) ilan metninde çoğunlukla yok.
   *   ofis · qaraj · obyekt — hiç eğitilmedi. Bunlar getiriye göre fiyatlanan
   *             ayrı bir piyasa; m² modeline sokulursa hem kendileri hem
   *             mənzil bozulur. Form bunları soruyordu ve motor anlamsız
   *             rakam üretiyordu — kapatıldı.
   */
  valuation: boolean;
};

export const CATEGORIES: CategoryConfig[] = [
  { key: "yeni_tikili", label: "Yeni tikili", icon: "🏢", colorVar: "var(--type-apartment)",
    rooms: true, areaM2: true, landSot: false, repair: true, metro: true, areaLabel: "Sahə (m²)",
    valuation: true },
  { key: "kohne_tikili", label: "Köhnə tikili", icon: "🏬", colorVar: "var(--type-apartment)",
    rooms: true, areaM2: true, landSot: false, repair: true, metro: true, areaLabel: "Sahə (m²)",
    valuation: true },
  { key: "heyet_evi", label: "Həyət evi/Bağ evi", icon: "🏡", colorVar: "var(--type-house)",
    rooms: true, areaM2: true, landSot: true, repair: true, metro: true, areaLabel: "Tikili sahəsi (m²)",
    valuation: true },
  { key: "ofis", label: "Ofis", icon: "🏛️", colorVar: "var(--type-apartment)",
    rooms: true, areaM2: true, landSot: false, repair: true, metro: true, areaLabel: "Sahə (m²)",
    valuation: false },
  { key: "qaraj", label: "Qaraj", icon: "🅿️", colorVar: "var(--type-land)",
    rooms: false, areaM2: true, landSot: false, repair: false, metro: false, areaLabel: "Sahə (m²)",
    valuation: false },
  { key: "torpaq", label: "Torpaq", icon: "🌳", colorVar: "var(--type-land)",
    rooms: false, areaM2: false, landSot: true, repair: false, metro: true, areaLabel: "",
    valuation: false },
  { key: "obyekt", label: "Obyekt", icon: "🏭", colorVar: "var(--type-house)",
    rooms: false, areaM2: true, landSot: false, repair: true, metro: true, areaLabel: "Sahə (m²)",
    valuation: false },
];

/** Değerleme formunun sunduğu kategoriler — ilan verme hepsini kabul eder. */
export const VALUATION_CATEGORIES = CATEGORIES.filter((c) => c.valuation);

export const CATEGORY_BY_KEY: Record<ReCategory, CategoryConfig> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<ReCategory, CategoryConfig>;

export { RE_CATEGORY_LABEL };
