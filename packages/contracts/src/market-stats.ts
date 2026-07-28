/**
 * Bakı bazar statistikası — OTOMATİK ÜRETİLDİ, elle düzenlemeyin.
 *
 * Üretim : python scripts/build_market_stats.py
 * Kaynak : 2026-07-27 tarixli Bakı taraması (tap.az)
 * Üretildi: 2026-07-28
 *
 * Bunlar İLAN DEĞİL, medyan istatistiktir. Toplanan ilanlar üründe hiçbir yerde
 * gösterilmez; bu tablo o veriden damıtılmış toplu değerlerdir.
 *
 * Örneklemi yetersiz kırılımlar tabloya HİÇ girmez — 12 ilandan rayon medyanı
 * üretmek kullanıcıyı yanıltır. `sqmRent` yoksa o bölgede aylıq kirayə örneği
 * güvenilir sayıda değildir ve gəlirlilik hesaplanamaz.
 *
 * Qiymətlər İSTƏNİLƏN qiymətlərdir (elan qiyməti), satılan qiymət deyil.
 */

export type MarketStat = {
  /** Rayon və ya qəsəbə adı */
  name: string;
  type: "apartment" | "house";
  /** Medyan satış qiyməti, ₼/m² */
  sqmSale: number;
  nSale: number;
  /** Medyan aylıq kirayə, ₼/m² — örnəklem azdırsa yoxdur */
  sqmRent?: number;
  nRent?: number;
};

export const MARKET_BY_DISTRICT: MarketStat[] = [
  { name: "Yasamal", type: "apartment", sqmSale: 2814, nSale: 1602, sqmRent: 10.0, nRent: 600 },
  { name: "Abşeron", type: "apartment", sqmSale: 1466, nSale: 1446, sqmRent: 6.8, nRent: 71 },
  { name: "Xətai", type: "apartment", sqmSale: 2476, nSale: 1059, sqmRent: 8.9, nRent: 249 },
  { name: "Nəsimi", type: "apartment", sqmSale: 3100, nSale: 603, sqmRent: 10.0, nRent: 268 },
  { name: "Binəqədi", type: "apartment", sqmSale: 2557, nSale: 573, sqmRent: 9.0, nRent: 104 },
  { name: "Nizami", type: "apartment", sqmSale: 2750, nSale: 543, sqmRent: 10.0, nRent: 243 },
  { name: "Nərimanov", type: "apartment", sqmSale: 3078, nSale: 506, sqmRent: 10.7, nRent: 241 },
  { name: "Sabunçu", type: "apartment", sqmSale: 2333, nSale: 339, sqmRent: 8.0, nRent: 48 },
  { name: "Səbail", type: "apartment", sqmSale: 2826, nSale: 304, sqmRent: 10.8, nRent: 92 },
  { name: "Suraxanı", type: "apartment", sqmSale: 1979, nSale: 271, sqmRent: 6.3, nRent: 26 },
  { name: "Qaradağ", type: "apartment", sqmSale: 1505, nSale: 140 },
  { name: "Xəzər", type: "apartment", sqmSale: 2240, nSale: 77 },
  { name: "Xəzər", type: "house", sqmSale: 1150, nSale: 1450 },
  { name: "Abşeron", type: "house", sqmSale: 825, nSale: 1049 },
  { name: "Sabunçu", type: "house", sqmSale: 833, nSale: 905 },
  { name: "Binəqədi", type: "house", sqmSale: 802, nSale: 464 },
  { name: "Suraxanı", type: "house", sqmSale: 830, nSale: 423 },
  { name: "Səbail", type: "house", sqmSale: 1128, nSale: 168 },
  { name: "Qaradağ", type: "house", sqmSale: 742, nSale: 98 },
  { name: "Xətai", type: "house", sqmSale: 1421, nSale: 88 },
  { name: "Yasamal", type: "house", sqmSale: 1775, nSale: 46 },
];

export const MARKET_BY_SETTLEMENT: MarketStat[] = [
  { name: "Masazır", type: "apartment", sqmSale: 1467, nSale: 1173, sqmRent: 6.8, nRent: 41 },
  { name: "Bakıxanov", type: "apartment", sqmSale: 2333, nSale: 248, sqmRent: 8.5, nRent: 28 },
  { name: "Yeni Günəşli", type: "apartment", sqmSale: 2294, nSale: 175, sqmRent: 8.8, nRent: 16 },
  { name: "Yeni Yasamal", type: "apartment", sqmSale: 2373, nSale: 172, sqmRent: 8.4, nRent: 56 },
  { name: "Lökbatan", type: "apartment", sqmSale: 1512, nSale: 117 },
  { name: "Hövsan", type: "apartment", sqmSale: 1900, nSale: 111, sqmRent: 6.0, nRent: 14 },
  { name: "Badamdar", type: "apartment", sqmSale: 2785, nSale: 92, sqmRent: 10.0, nRent: 12 },
  { name: "7-ci mikrorayon", type: "apartment", sqmSale: 2587, nSale: 76 },
  { name: "Bayıl", type: "apartment", sqmSale: 2600, nSale: 75, sqmRent: 8.1, nRent: 13 },
  { name: "Qaraçuxur", type: "apartment", sqmSale: 2112, nSale: 62 },
  { name: "Saray", type: "apartment", sqmSale: 1429, nSale: 45 },
  { name: "Biləcəri", type: "apartment", sqmSale: 2142, nSale: 41 },
  { name: "Nardaran", type: "apartment", sqmSale: 3594, nSale: 39 },
  { name: "Əhmədli", type: "apartment", sqmSale: 2275, nSale: 38 },
  { name: "Məhəmmədi", type: "apartment", sqmSale: 1296, nSale: 38 },
  { name: "8-ci mikrorayon", type: "apartment", sqmSale: 2728, nSale: 38 },
  { name: "9-cu mikrorayon", type: "apartment", sqmSale: 2591, nSale: 37 },
  { name: "Köhnə Günəşli", type: "apartment", sqmSale: 2200, nSale: 33 },
  { name: "Zığ", type: "apartment", sqmSale: 2126, nSale: 32 },
  { name: "Binə", type: "house", sqmSale: 660, nSale: 533 },
  { name: "Mərdəkan", type: "house", sqmSale: 1957, nSale: 396 },
  { name: "Maştağa", type: "house", sqmSale: 751, nSale: 352 },
  { name: "Masazır", type: "house", sqmSale: 845, nSale: 323 },
  { name: "Hövsan", type: "house", sqmSale: 690, nSale: 254 },
  { name: "Şüvəlan", type: "house", sqmSale: 1629, nSale: 242 },
  { name: "Binəqədi", type: "house", sqmSale: 750, nSale: 222 },
  { name: "Buzovna", type: "house", sqmSale: 1139, nSale: 145 },
  { name: "Novxanı", type: "house", sqmSale: 1086, nSale: 129 },
  { name: "Mehdiabad", type: "house", sqmSale: 812, nSale: 126 },
  { name: "Saray", type: "house", sqmSale: 839, nSale: 108 },
  { name: "Biləcəri", type: "house", sqmSale: 920, nSale: 81 },
  { name: "Hökməli", type: "house", sqmSale: 560, nSale: 80 },
  { name: "Zabrat", type: "house", sqmSale: 864, nSale: 78 },
  { name: "Ramana", type: "house", sqmSale: 696, nSale: 72 },
  { name: "Məhəmmədi", type: "house", sqmSale: 840, nSale: 69 },
  { name: "Savalan", type: "house", sqmSale: 808, nSale: 61 },
  { name: "Qobu", type: "house", sqmSale: 535, nSale: 56 },
  { name: "Lökbatan", type: "house", sqmSale: 928, nSale: 53 },
  { name: "Bakıxanov", type: "house", sqmSale: 1410, nSale: 50 },
  { name: "Badamdar", type: "house", sqmSale: 1660, nSale: 48 },
  { name: "Yeni Suraxanı", type: "house", sqmSale: 950, nSale: 45 },
  { name: "Nardaran", type: "house", sqmSale: 1366, nSale: 44 },
  { name: "Albalılıq", type: "house", sqmSale: 1112, nSale: 41 },
  { name: "Bilgəh", type: "house", sqmSale: 1579, nSale: 40 },
  { name: "Bayıl", type: "house", sqmSale: 1188, nSale: 37 },
  { name: "Qaraçuxur", type: "house", sqmSale: 1250, nSale: 35 },
  { name: "Türkan", type: "house", sqmSale: 650, nSale: 33 },
  { name: "Yeni Ramana", type: "house", sqmSale: 907, nSale: 33 },
  { name: "Sulutəpə", type: "house", sqmSale: 750, nSale: 31 },
  { name: "Görədil", type: "house", sqmSale: 884, nSale: 28 },
  { name: "Pirşağı", type: "house", sqmSale: 998, nSale: 26 },
  { name: "Qala", type: "house", sqmSale: 659, nSale: 26 },
];

/** İllik kirayə gəlirliliyi, %. Kirayə örnəkləmi yoxdursa null. */
export function annualYield(s: MarketStat): number | null {
  if (s.sqmRent == null) return null;
  return (s.sqmRent * 12) / s.sqmSale * 100;
}

/** Bir bölgə üçün statistika; tapılmazsa undefined. */
export function statFor(
  name: string,
  type: MarketStat["type"],
  scope: "district" | "settlement" = "district",
): MarketStat | undefined {
  const table = scope === "district" ? MARKET_BY_DISTRICT : MARKET_BY_SETTLEMENT;
  return table.find((s) => s.name === name && s.type === type);
}
