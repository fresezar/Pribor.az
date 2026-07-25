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
  /** user = platformda verilmiş ilan (PRB no'lu), scraped = piyasa verisi. */
  kind: z.enum(["user", "scraped"]).default("scraped"),
  /** Yalnızca kullanıcı ilanlarında: "PRB-10042". */
  refNo: z.string().nullable().default(null),
  status: z.string().default("active"),
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
  /** Kapak fotoğrafı (data URI) — liste yükünü şişirmemek için yalnızca kapak. */
  coverPhoto: z.string().nullable().default(null),
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
  /** Örtük şəkli — photos dizisindeki kapak fotoğrafının indeksi. */
  coverPhotoIdx: z.number().int().min(0).max(4).default(0),

  // --- İletişim (ilanda GÖRÜNÜR) ---
  /** İlanda görünecek isim/ünvan (alıcı görür). */
  contactName: z.string().min(2).max(120),
  /** İlanda görünecek iletişim numarası (alıcı görür). */
  contactPhone: z.string().min(5).max(20),
  /**
   * Doğrulama girişte yapılır (OTP), bu yüzden formda numara/OTP sorulmaz.
   * Haftalık limit hesabın (oturum) numarasına göre sayılır; sunucu
   * verification_phone'u oturumdan türetir. promoCode admin bypass için
   * opsiyonel kalır (arayüzde gösterilmez).
   */
  promoCode: z.string().max(50).optional(),
});
export type CreateListingDto = z.infer<typeof CreateListingDto>;

/**
 * İlan düzenleme — sahip veya admin. Tüm alanlar opsiyonel (kısmi güncelleme);
 * gönderilmeyen alan olduğu gibi kalır. Fiyat değişirse price_snapshots'a
 * (ref_kind='listing') tarih satırı düşer — kullanıcı ilanı fiyat geçmişi.
 */
export const UpdateListingDto = CreateListingDto.omit({ valuationId: true })
  .partial()
  .extend({ userId: z.string().uuid() });
export type UpdateListingDto = z.infer<typeof UpdateListingDto>;

/** Fiyat geçmişi noktası — detay ekranındaki "Qiymət tarixçəsi". */
export const PricePoint = z.object({
  at: z.string(),
  priceAzn: z.number().int(),
});
export type PricePoint = z.infer<typeof PricePoint>;

/** "Mənim elanlarım" kartı. */
export const UserListing = z.object({
  id: z.string().uuid(),
  refNo: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  propertyType: z.string().nullable(),
  district: z.string().nullable(),
  rooms: z.number().int().nullable(),
  areaM2: z.number().nullable(),
  priceAzn: z.number().int(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  coverPhotoIdx: z.number().int().default(0),
  createdAt: z.string(),
});
export type UserListing = z.infer<typeof UserListing>;

/**
 * İlan detayı (modal). Hem kullanıcı ilanları hem scraped piyasa kayıtları
 * aynı şekle indirgenir. Giriş yapmamış kullanıcı bu uca erişemez —
 * əlaqə nömrəsi yalnızca oturum açmış kullanıcıya döner.
 */
export const ListingDetail = z.object({
  id: z.string().uuid(),
  kind: z.enum(["user", "scraped"]),
  refNo: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  propertyType: z.string().nullable(),
  district: z.string().nullable(),
  settlement: z.string().nullable(),
  rooms: z.number().int().nullable(),
  areaM2: z.number().nullable(),
  landAreaSot: z.number().nullable(),
  buildingType: z.string().nullable(),
  repairState: z.number().int().nullable(),
  titleDeed: z.boolean().nullable(),
  metroStation: z.string().nullable(),
  priceAzn: z.number().int(),
  pricePerM2: z.number().int().nullable(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  coverPhotoIdx: z.number().int().default(0),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  createdAt: z.string(),
  sourceSite: z.string().nullable(),
  /** Sahip veya admin mi — sil / satıldı / redaktə aksiyonlarını açar. */
  canManage: z.boolean(),
  /** Kronolojik fiyat gözlemleri (kullanıcı ilanı + scraped) — 1'den fazlaysa UI tarixçə gösterir. */
  priceHistory: z.array(PricePoint).default([]),
});
export type ListingDetail = z.infer<typeof ListingDetail>;

/** İlan limiti aşıldığında dönen hata gövdesi (frontend upgrade modalını açar). */
export const LISTING_LIMIT_CODE = "LISTING_LIMIT_EXCEEDED" as const;

/** Haftalık telefon-bazlı ilan limiti aşıldığında dönen hata kodu. */
export const WEEKLY_LIMIT_CODE = "WEEKLY_LIMIT_EXCEEDED" as const;
/** Doğrulama numarası için OTP gerekli / geçersiz hata kodları. */
export const OTP_REQUIRED_CODE = "OTP_REQUIRED" as const;
export const OTP_INVALID_CODE = "OTP_INVALID" as const;
/** Haftalık ücretsiz ilan üst sınırı (verification_phone başına, 7 gün). */
export const WEEKLY_FREE_LIMIT = 3;

/** İlan numarası biçimi: 10042 → "PRB-10042". */
export const formatRefNo = (n: number | null | undefined): string | null =>
  n == null ? null : `PRB-${n}`;

/** "PRB-10042" | "10042" → 10042 (geçersizse null). */
export function parseRefNo(input: string): number | null {
  const digits = input.trim().replace(/^prb[-\s]?/i, "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
