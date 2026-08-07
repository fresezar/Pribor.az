import { z } from "zod";
import { DealType } from "./category";
import { BakuDistrict, BuildingType, PropertyType, RepairState } from "./enums";

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
  /** İlan növü filtresi: sale | rent. */
  dealType: z.string().optional(),
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
  /** user = platformda verilmiş ilan (numaralı), scraped = piyasa verisi. */
  kind: z.enum(["user", "scraped"]).default("scraped"),
  /** Yalnızca kullanıcı ilanlarında: "10042". */
  refNo: z.string().nullable().default(null),
  status: z.string().default("active"),
  dealType: DealType.default("sale"),
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
  /** Tam emlak tipi (7 kategoriyi kapsar: office/garage/commercial dahil). */
  propertyType: PropertyType,
  /** İlan növü — satış / kirayə. */
  dealType: DealType.default("sale"),
  district: BakuDistrict,
  /**
   * Qəsəbə/mikrorayon (Ramana, Binə, Bakıxanov…) — yalnız elanda toplanır.
   * Qiymətləndirmə modeli bu kırılımı bilmediği için değerleme formunda yoktur.
   */
  settlement: z.string().max(80).optional(),
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
  /*
    15 foto. Ölçüldü: istemci yeniden boyutlandırdıqdan sonra (1280px, JPEG %72)
    bir foto ~168 KB data URI; 15 foto ≈ 2,5 MB — API gövde limiti 16 MB.

    Foto başına tavan 3 MB-dan 1 MB-a ENDİRİLDİ: 15 × 3 MB = 45 MB, gövde
    limitini aşıb 413 verərdi. 1 MB ölçülən ehtiyacın 6 qatıdır və
    15 × 1 MB = 15 MB limitin altında qalır.
  */
  photos: z.array(z.string().max(1_000_000)).max(15).default([]),
  /** Örtük şəkli — photos dizisindeki kapak fotoğrafının indeksi. */
  coverPhotoIdx: z.number().int().min(0).max(4).default(0),

  // --- İletişim (ilanda GÖRÜNÜR) ---
  /** İlanda görünecek isim/ünvan (alıcı görür). */
  contactName: z.string().min(2).max(120),
  /** İlanda görünecek iletişim numarası (alıcı görür). */
  contactPhone: z.string().min(5).max(20),
  /**
   * Nömrənin YAYIMLANMASINA açıq razılıq — formdakı işarə qutusu.
   *
   * NİYƏ SERVER TƏRƏFİNDƏ MƏCBURİDİR: razılıq şərtlərin dibinə basdırılmış bir
   * cümlə olsaydı, heç kim oxumadan nömrəsini yayımlamış olardı. Razılıq tam o
   * anda — nömrəni yazdığı anda — və nə olacağını bilərək verilməlidir. Yalnız
   * brauzerdə yoxlansaydı bu, gerçək bir hədd deyil, xatırlatma olardı.
   */
  phonePublicAck: z.literal(true, {
    errorMap: () => ({ message: "Nömrənizin elanda görünməsinə razılıq verməlisiniz" }),
  }),
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
  dealType: DealType.default("sale"),
  propertyType: z.string().nullable(),
  buildingType: z.string().nullable().default(null),
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
 * İlan detayı (modal). Herkese açıktır — alıcının ilana bakmak için hesap
 * açması gereksiz sürtünmedir.
 *
 * ƏLAQƏ NÖMRƏSİ BU CAVABDA YOXDUR. `contactPhone` bilerek kaldırıldı:
 * ölçüldü, liste ucundan bütün ilan kimlikleri alınıp detaylar tek tek
 * çekilerek dakikada 120 numara toplanabiliyordu. Numara artık ayrı bir uçtan
 * (`GET /listings/:id/contact`, bkz. ListingContact) ve daha sıkı bir sürət
 * limiti ilə gəlir — səhifə mənbəyində, JSON-da və axtarış motorunda yoxdur.
 * `contactName` qalır: kimin elanı olduğunu bilmək zərərsizdir, onunla
 * heç kimə zəng edilə bilməz.
 */
export const ListingDetail = z.object({
  id: z.string().uuid(),
  kind: z.enum(["user", "scraped"]),
  refNo: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  dealType: DealType.default("sale"),
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
  /** Nömrənin ümumiyyətlə olub-olmadığı — düyməni göstərmək/gizlətmək üçün. */
  hasContactPhone: z.boolean().default(false),
  createdAt: z.string(),
  sourceSite: z.string().nullable(),
  /** Sahip veya admin mi — sil / satıldı / redaktə aksiyonlarını açar. */
  canManage: z.boolean(),
  /** Kronolojik fiyat gözlemleri (kullanıcı ilanı + scraped) — 1'den fazlaysa UI tarixçə gösterir. */
  priceHistory: z.array(PricePoint).default([]),
});
export type ListingDetail = z.infer<typeof ListingDetail>;

/**
 * Əlaqə nömrəsi — AYRI uçtan, "Nömrəni göstər" tıklaması ilə.
 *
 * NİYƏ AYRI: nömrə detay cavabının içindəykən, elanları gəzən bir bot heç bir
 * əlavə iş görmədən hər elanın nömrəsini toplayırdı. İndi nömrəni almaq üçün
 * ayrıca, niyyətli bir istək lazımdır və o uc dəqiqədə {@link CONTACT_RATE_LIMIT}
 * istəklə məhdudlaşır.
 *
 * BUNUN NƏ OLMADIĞI DA AÇIQ DEYİLMƏLİDİR: bu, nömrəni gizlətmir. Elanı açan
 * hər kəs bir toxunuşla görə bilir — çünki alıcı zəng edə bilməsə elanın mənası
 * qalmır. Toplu hasadı çətinləşdirir, mümkünsüz etmir. Nömrənin tamamilə
 * gizli qalması yalnız sayt daxilində mesajlaşma və ya maskalanmış nömrə ilə
 * mümkündür — ikisi də bu mərhələdə yoxdur.
 */
export const ListingContact = z.object({
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
});
export type ListingContact = z.infer<typeof ListingContact>;

/** Əlaqə ucunun IP başına dəqiqəlik limiti. */
export const CONTACT_RATE_LIMIT = 10;

/** İlan limiti aşıldığında dönen hata gövdesi (frontend upgrade modalını açar). */
export const LISTING_LIMIT_CODE = "LISTING_LIMIT_EXCEEDED" as const;

/** Haftalık telefon-bazlı ilan limiti aşıldığında dönen hata kodu. */
export const WEEKLY_LIMIT_CODE = "WEEKLY_LIMIT_EXCEEDED" as const;
/** Doğrulama numarası için OTP gerekli / geçersiz hata kodları. */
export const OTP_REQUIRED_CODE = "OTP_REQUIRED" as const;
export const OTP_INVALID_CODE = "OTP_INVALID" as const;
/** Haftalık ücretsiz ilan üst sınırı (verification_phone başına, 7 gün). */
export const WEEKLY_FREE_LIMIT = 3;

/**
 * İlan numarası biçimi: 10042 → "10042".
 *
 * Eskiden "PRB-" öneki vardı; kullanıcılar kafa karıştırıcı buldu. Numara
 * bilinçli olarak yalnızca rakamdır: kalıcıdır (ilan düzenlenip rayonu
 * değişse bile aynı kalır) ve telefonda söylemesi/aramada yazması kolaydır.
 * parseRefNo eski "PRB-10042" yazımını hâlâ kabul eder — paylaşılmış
 * numaralar ölmesin.
 */
export const formatRefNo = (n: number | null | undefined): string | null =>
  n == null ? null : String(n);

/** "PRB-10042" | "10042" → 10042 (geçersizse null). */
export function parseRefNo(input: string): number | null {
  const digits = input.trim().replace(/^prb[-\s]?/i, "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
