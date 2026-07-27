import type { BakuDistrict } from "./enums";

/**
 * Rayon → qəsəbə/mikrorayon listesi (yalnız ELAN formu için).
 *
 * Qiymətləndirmə formu bilinçli olarak yalnız rayon sorar: model qəsəbə
 * kırılımını bilmiyor, seçtirsek yok sayar ve kullanıcıya olduğundan hassas
 * bir tahmin izlenimi verirdi. İlanda ise qəsəbə saf kazanç — alıcı arar,
 * kartta "Rayon · Qəsəbə" görünür ve veri birikince model bu kırılımla
 * yeniden eğitilebilir.
 *
 * Liste tam değildir; eksik qəsəbə eklemek için diziye yazmak yeterlidir.
 */
export const BAKU_SETTLEMENTS: Record<BakuDistrict, string[]> = {
  Binəqədi: [
    "Binəqədi", "Biləcəri", "Xocəsən", "M.Ə.Rəsulzadə", "Sulutəpə",
    "1-ci mikrorayon", "2-ci mikrorayon", "3-cü mikrorayon", "4-cü mikrorayon",
    "5-ci mikrorayon", "6-cı mikrorayon", "7-ci mikrorayon", "8-ci mikrorayon",
    "9-cu mikrorayon",
  ],
  Xətai: ["Əhmədli", "Həzi Aslanov", "Günəşli", "NZS", "Xətai"],
  Xəzər: [
    "Binə", "Türkan", "Qala", "Mərdəkan", "Şüvəlan", "Buzovna", "Zirə",
    "Dübəndi", "Şağan",
  ],
  Qaradağ: [
    "Lökbatan", "Səngəçal", "Ələt", "Puta", "Müşfiqabad", "Sahil",
    "Qızıldaş", "Şıxlar",
  ],
  Nərimanov: ["Böyükşor", "Nərimanov", "Bakıxanov yolu"],
  Nəsimi: ["28 May", "Gənclik", "Montin", "Yeni Nəsimi"],
  Nizami: ["Keşlə", "8-ci kilometr", "Qara Qarayev", "Nizami"],
  Pirallahı: ["Pirallahı", "Gürgan"],
  Sabunçu: [
    "Bakıxanov", "Ramana", "Zabrat", "Maştağa", "Nardaran", "Bilgəh",
    "Sabunçu", "Kürdəxanı", "Pirşağı", "Balaxanı", "Digah", "Yeni Ramana",
  ],
  Səbail: ["Bayıl", "Badamdar", "Şıxov", "İçərişəhər", "Bibiheybət"],
  Suraxanı: [
    "Hövsan", "Əmircan", "Zığ", "Bülbülə", "Qaraçuxur", "Yeni Suraxanı",
    "Suraxanı", "Dağlıq",
  ],
  Yasamal: ["Yasamal", "Yeni Yasamal", "20-ci sahə"],
  Abşeron: [
    "Xırdalan", "Masazır", "Saray", "Novxanı", "Görədil", "Fatmayi",
    "Ceyranbatan", "Qobu", "Güzdək", "Hökməli", "Məhəmmədi",
  ],
};

/** Rayonun qəsəbələri (bilinmeyen rayon → boş dizi). */
export function settlementsOf(district: string): string[] {
  return BAKU_SETTLEMENTS[district as BakuDistrict] ?? [];
}
