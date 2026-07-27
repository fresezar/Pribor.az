import type { BakuDistrict } from "./enums";

/**
 * Bakı metro stansiyaları — rayona görə.
 *
 * NEDEN İSTASYON, MESAFE DEĞİL: değerleme formu önceden "metroya məsafə"
 * soruyordu ama o alan modelde ÖLÇÜLEN ÖNEMİ 0.0 idi ve gerçek veride %0
 * doluydu — mesafe hesabı geocoding ister, motorun dışa bağımlı olmaması
 * gerekiyor. İstasyon adı ise ilan metninde yazılı geçiyor ve şəhər içində
 * güçlü bir konum sinyali: modele eklendiğinde mənzil medyan hatası
 * %10.1'den %9.7'ye indi.
 *
 * Liste scraper'ın sözlüğüyle (normalize/dictionaries.METRO_STATIONS) AYNI
 * yazımı kullanır — kayması modelin istasyonu tanımamasına yol açar.
 */
export const METRO_BY_DISTRICT: Partial<Record<BakuDistrict, string[]>> = {
  Səbail: ["İçərişəhər", "Sahil"],
  Nəsimi: ["28 May", "Gənclik", "Nəsimi", "Cəfər Cabbarlı"],
  Nərimanov: ["Nəriman Nərimanov", "Ulduz", "Koroğlu"],
  Nizami: ["Qara Qarayev", "Neftçilər", "Xalqlar Dostluğu", "Nizami"],
  Xətai: ["Şah İsmayıl Xətai", "Əhmədli", "Həzi Aslanov"],
  Yasamal: ["Elmlər Akademiyası", "İnşaatçılar", "20 Yanvar", "Memar Əcəmi", "8 Noyabr"],
  Binəqədi: ["Azadlıq prospekti", "Dərnəgül", "Avtovağzal"],
};

/** Rayondakı metro stansiyaları; metrosu olmayan rayonda boş dizi. */
export function metroStationsOf(district: string): string[] {
  return METRO_BY_DISTRICT[district as BakuDistrict] ?? [];
}
