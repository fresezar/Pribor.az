import { z } from "zod";

/**
 * Uygulama seviyesi kullanıcı rolleri. DB users.role enum'una eşlenir:
 *   USER          → individual
 *   AGENT_ADMIN   → agent    (Rəsmi Emlakçı / Agentlik — sınırsız ilan)
 *   PREMIUM_USER  → individual + aktif pro abonelik (sınırsız ilan)
 * PREMIUM_USER bir "rol" değil, abonelikten türeyen durumdur; bu yüzden
 * yalnızca AuthUser.role çıktısında görünür, DB'de individual olarak durur.
 */
export const AppUserRole = z.enum(["USER", "AGENT_ADMIN", "PREMIUM_USER"]);
export type AppUserRole = z.infer<typeof AppUserRole>;

/** Kullanıcının ne yapabileceği — plans.entitlements JSONB'sinden türetilir. */
export const Entitlements = z.object({
  /** Aktif ilan üst sınırı. -1 = sınırsız. */
  maxActiveListings: z.number().int(),
  unlimited: z.boolean(),
  planCode: z.string(),
});
export type Entitlements = z.infer<typeof Entitlements>;

export const AuthUser = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** Hesap kimliği — giriş email'i. */
  email: z.string(),
  role: AppUserRole,
  entitlements: Entitlements,
  activeListings: z.number().int().default(0),
});
export type AuthUser = z.infer<typeof AuthUser>;

/**
 * Mock giriş (test/geriye dönük) — OTP'siz hesap açar.
 *
 * Rol İSTEMCİDEN ALINMAZ: herkes düz USER olarak kaydolur; yönetici yetkisi
 * yalnızca sunucudaki ADMIN_EMAILS listesindeki email ile girildiğinde verilir.
 * Böylece istemci kendini yükseltemez.
 */
export const MockLoginDto = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(120),
});
export type MockLoginDto = z.infer<typeof MockLoginDto>;

/** Giriş: email'e gelen OTP ile doğrula + hesabı aç/oluştur. */
export const VerifyLoginDto = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(120),
  code: z.string().min(4).max(8),
});
export type VerifyLoginDto = z.infer<typeof VerifyLoginDto>;

/** Mock ödeme sonrası paket yükseltme. */
export const UpgradeDto = z.object({
  userId: z.string().uuid(),
  planCode: z.string().default("pro_unlimited"),
});
export type UpgradeDto = z.infer<typeof UpgradeDto>;
