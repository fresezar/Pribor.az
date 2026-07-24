/**
 * Hafif tarayıcı-olayı köprüsü — bileşenler arası "prop drilling" olmadan
 * ilan akışını tetiklemek için. İki olay:
 *   NEW_LISTING       → yeni ilan formunu aç (SiteHeader dinler)
 *   LISTINGS_CHANGED  → ilan listesi değişti, yeniden yükle (MarketView dinler)
 */

export const NEW_LISTING = "pribor:new-listing";
export const LISTINGS_CHANGED = "pribor:listings-changed";

/** Herhangi bir yerden "yeni ilan ver" akışını başlat. */
export function requestNewListing(): void {
  window.dispatchEvent(new Event(NEW_LISTING));
}

/** İlan oluşturuldu/güncellendi/silindi — dinleyen listeler tazelensin. */
export function notifyListingsChanged(): void {
  window.dispatchEvent(new Event(LISTINGS_CHANGED));
}
