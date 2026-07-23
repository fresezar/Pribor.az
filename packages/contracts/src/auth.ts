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
  phone: z.string(),
  role: AppUserRole,
  entitlements: Entitlements,
  activeListings: z.number().int().default(0),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** Mock giriş — Faz 3'te gerçek OTP doğrulaması bu akışın yerini alır. */
export const MockLoginDto = z.object({
  phone: z.string().min(5).max(20),
  name: z.string().min(2).max(120),
  /** Test için: kullanıcı hangi rolle girmek istiyor. */
  role: AppUserRole.default("USER"),
});
export type MockLoginDto = z.infer<typeof MockLoginDto>;

/** Mock ödeme sonrası paket yükseltme. */
export const UpgradeDto = z.object({
  userId: z.string().uuid(),
  planCode: z.string().default("pro_unlimited"),
});
export type UpgradeDto = z.infer<typeof UpgradeDto>;
