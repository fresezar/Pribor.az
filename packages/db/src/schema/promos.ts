import { boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Promo / admin kodları — ilan verme formundaki subtil "Admin / Promokod"
 * alanına girilen kod. Geçerliyse haftalık ilan limiti bypass edilir.
 *
 * Telefon whitelist'i (.env ADMIN_PHONES) ile birlikte iki bypass yolundan
 * biridir: Yöntem A = promo kod, Yöntem B = numara whitelist.
 */
export const promoCodes = pgTable("promo_codes", {
  code: varchar("code", { length: 50 }).primaryKey(),
  label: varchar("label", { length: 120 }),
  /** true → limitsiz ilan (admin/VIP). Kayıt sayaç mantığı ileride eklenebilir. */
  isUnlimitedAdmin: boolean("is_unlimited_admin").notNull().default(true),
  /** null → süresiz geçerli. */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
