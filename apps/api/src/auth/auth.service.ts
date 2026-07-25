import { createHash } from "node:crypto";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  type AppUserRole,
  type AuthUser,
  type Entitlements,
  type OtpRequestResult,
  WEEKLY_FREE_LIMIT,
} from "@pribor/contracts";
import {
  and,
  db,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  listings,
  otpCodes,
  plans,
  promoCodes,
  sql,
  subscriptions,
  users,
} from "@pribor/db";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Demo promo kodu — boot'ta idempotent seed edilir (Yöntem A bypass). */
const DEMO_PROMO = "PRIBOR-VIP";
const OTP_TTL_SEC = 300;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Monetizasyon şimdilik ERTELENDİ: ilan panosu ilk etapta tamamen ücretsiz —
 * herkes sınırsız ilan verebilir. Ödeme/abonelik geri açılınca bunu true yap;
 * limit + UpgradeModal altyapısı olduğu gibi hazır bekliyor.
 */
const MONETIZATION_ENABLED = false;

/** Monetizasyon açıkken bireysel kullanıcı ücretsiz aktif ilan limiti. */
const FREE_MAX_LISTINGS = 5;
const PRO_PLAN_CODE = "pro_unlimited";
const FREE_PLAN_CODE = "free";
/** Satılan/kaldırılan ilan limiti doldurmaz — yalnızca yayındakiler sayılır. */
const ACTIVE_STATUSES = ["draft", "pending_review", "active"] as const;

/**
 * Yönetici numaraları — .env ADMIN_PHONES (virgülle ayrık, E.164).
 * Rol istemciden GELMEZ; bu listedeki numarayla giriş yapan otomatik
 * admin (AGENT_ADMIN) olur. Böylece istemci kendini yükseltemez.
 */
function adminPhones(): string[] {
  const raw = process.env.ADMIN_PHONES ?? "+994555000001";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Mock kimlik + yetki (entitlement) katmanı.
 *
 * Faz 3'te gerçek OTP + JWT oturumu bunun yerini alır; şimdilik mock-login
 * kullanıcıyı DB'ye upsert eder (gerçek userId üretir) ve limit/rol mantığı
 * uçtan uca DB üzerinden çalışır — sadece frontend tiyatrosu değil.
 *
 * Rol eşlemesi (uygulama → DB users.role enum):
 *   USER → individual · AGENT_ADMIN → agent · PREMIUM_USER → individual + pro abonelik
 * Sınırsızlık iki yoldan gelir: role=agent VEYA aktif pro abonelik.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /** Referans veri: iki plan boot'ta idempotent upsert edilir. */
  async onModuleInit(): Promise<void> {
    try {
      await db
        .insert(plans)
        .values([
          {
            code: FREE_PLAN_CODE,
            name: { az: "Pulsuz", ru: "Бесплатный", en: "Free" },
            period: "monthly",
            priceQepik: 0,
            entitlements: { active_listings: FREE_MAX_LISTINGS },
            isActive: true,
          },
          {
            code: PRO_PLAN_CODE,
            name: { az: "Sərhədsiz Abunəlik", ru: "Безлимит", en: "Unlimited" },
            period: "monthly",
            priceQepik: 2900, // 29 AZN
            entitlements: { active_listings: -1, deal_radar: true, badge: "agent" },
            isActive: true,
          },
        ])
        // Referans veri: entitlement/fiyat değişikliği her boot'ta senkronlanır
        .onConflictDoUpdate({
          target: plans.code,
          set: {
            entitlements: sql`excluded.entitlements`,
            priceQepik: sql`excluded.price_qepik`,
            isActive: sql`excluded.is_active`,
          },
        });
      this.logger.log("Planlar hazır (free, pro_unlimited)");
    } catch (err) {
      this.logger.error(`Plan seed hatası: ${String(err)}`);
    }
    // Demo promo kodu (Admin/Promokod bypass'ını test etmek için)
    try {
      await db
        .insert(promoCodes)
        .values({ code: DEMO_PROMO, label: "Demo VIP — limitsiz", isUnlimitedAdmin: true })
        .onConflictDoNothing({ target: promoCodes.code });
    } catch (err) {
      this.logger.error(`Promo seed hatası: ${String(err)}`);
    }
  }

  // ------------------------------------------------------------------ OTP

  /**
   * Doğrulama numarasına OTP gönderir. Gerçek SMS sağlayıcısı henüz yok:
   * kod hash'lenip otp_codes'a yazılır, konsola loglanır ve non-production'da
   * yanıtta devCode olarak döner (arayüz/test kullanabilsin). Prod'a geçişte
   * yalnızca "mock gönderici" gerçek gateway ile değişir.
   */
  async requestOtp(phone: string, purpose = "login"): Promise<OtpRequestResult> {
    const p = this.normalizePhone(phone);
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 haneli
    const expiresAt = new Date(Date.now() + OTP_TTL_SEC * 1000);
    await db.insert(otpCodes).values({
      phone: p,
      codeHash: sha256(code),
      purpose,
      expiresAt,
    });
    this.logger.log(`OTP → ${p}: ${code} (mock SMS)`);
    const devCode = process.env.NODE_ENV === "production" ? undefined : code;
    return { sent: true, expiresInSec: OTP_TTL_SEC, devCode };
  }

  /** Kodu doğrular ve tüketir (tek kullanımlık). Brute-force freni: 5 deneme. */
  async verifyOtp(phone: string, code: string, purpose = "login"): Promise<boolean> {
    const p = this.normalizePhone(phone);
    const [row] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, p),
          eq(otpCodes.purpose, purpose),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (!row || (row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) return false;

    const ok = sha256(code) === row.codeHash;
    await db
      .update(otpCodes)
      .set({ attempts: (row.attempts ?? 0) + 1, consumedAt: ok ? new Date() : null })
      .where(eq(otpCodes.id, row.id));
    return ok;
  }

  // -------------------------------------------------------- bypass yardımcıları

  /** .env ADMIN_PHONES whitelist'i (Yöntem B). */
  isWhitelisted(phone: string): boolean {
    return adminPhones().includes(this.normalizePhone(phone));
  }

  /** Geçerli (süresi dolmamış) promo kodu mu (Yöntem A). */
  async isPromoValid(code: string): Promise<boolean> {
    const row = await db.query.promoCodes.findFirst({
      where: eq(promoCodes.code, code.trim()),
    });
    if (!row) return false;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return false;
    return true;
  }

  /** Kullanıcının oturum numarası (verificationPhone ön-doğrulama kontrolü için). */
  async userPhone(userId: string): Promise<string | null> {
    const u = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { phone: true },
    });
    return u?.phone ?? null;
  }

  /** E.164 normalize — listings.service da doğrulama numarasında kullanır. */
  normalize(phone: string): string {
    return this.normalizePhone(phone);
  }

  /**
   * Herkes düz kullanıcı olarak girer; rol sunucuda belirlenir:
   * numara ADMIN_PHONES listesindeyse 'admin', değilse 'individual'.
   */
  async mockLogin(dto: { phone: string; name: string }): Promise<AuthUser> {
    const phone = this.normalizePhone(dto.phone);
    const dbRole = adminPhones().includes(phone) ? "admin" : "individual";

    const [row] = await db
      .insert(users)
      .values({ phone, fullName: dto.name, role: dbRole, phoneVerifiedAt: new Date() })
      .onConflictDoUpdate({
        target: users.phone,
        set: { fullName: dto.name, role: dbRole, phoneVerifiedAt: new Date() },
      })
      .returning({ id: users.id });

    if (!row) throw new Error("Kullanıcı upsert edilemedi");
    if (dbRole === "admin") this.logger.log(`Admin girişi: ${phone}`);
    return this.buildAuthUser(row.id, dto.name, phone);
  }

  /**
   * OTP ile giriş: kod doğrulanırsa hesabı açar/oluşturur. Doğrulama artık
   * yalnızca burada (girişte) yapılır; ilan formunda tekrar OTP sorulmaz.
   * Kod geçersizse null döner (controller 401 verir).
   */
  async verifyLogin(phone: string, name: string, code: string): Promise<AuthUser | null> {
    const ok = await this.verifyOtp(phone, code, "login");
    if (!ok) return null;
    return this.mockLogin({ phone, name });
  }

  /** Yönetici mi — ilan silme/satıldı yetkisi bunu kullanır. */
  async isAdmin(userId: string): Promise<boolean> {
    const u = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    return u?.role === "admin";
  }

  /** Kullanıcı var mı — auth gate'li uçlar için hafif doğrulama. */
  async exists(userId: string): Promise<boolean> {
    const u = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true },
    });
    return Boolean(u);
  }

  /** Mock ödeme sonrası: pro aboneliği aç → sınırsız ilan. */
  async upgrade(userId: string, planCode = PRO_PLAN_CODE): Promise<AuthUser> {
    const plan = await db.query.plans.findFirst({ where: eq(plans.code, planCode) });
    if (!plan) throw new Error(`Plan yok: ${planCode}`);

    // Var olan aktif abonelik varsa tekrar açma (idempotent-ish)
    const existing = await db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")),
    });
    if (!existing) {
      const renews = new Date();
      renews.setMonth(renews.getMonth() + 1);
      await db.insert(subscriptions).values({
        userId,
        planId: plan.id,
        status: "active",
        renewsAt: renews,
      });
    }
    return this.getAuthUser(userId);
  }

  async getAuthUser(userId: string): Promise<AuthUser> {
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u) throw new Error("Kullanıcı bulunamadı");
    return this.buildAuthUser(u.id, u.fullName ?? "İstifadəçi", u.phone);
  }

  /** Yetki çözümleyici — listing create burayı tek kapı olarak kullanır. */
  async resolveEntitlements(userId: string): Promise<{
    entitlements: Entitlements;
    role: AppUserRole;
    dbRole: string;
  }> {
    const u = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    const dbRole = u?.role ?? "individual";

    // 1) Emlakçı/Admin → sınırsız
    if (dbRole === "agent" || dbRole === "admin" || dbRole === "dealer") {
      return {
        entitlements: { maxActiveListings: -1, unlimited: true, planCode: "agent" },
        role: "AGENT_ADMIN",
        dbRole,
      };
    }

    // 2) Aktif pro abonelik → sınırsız (PREMIUM_USER)
    const sub = await db
      .select({ ent: plans.entitlements, code: plans.code })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .limit(1);

    if (sub[0]) {
      const max = Number((sub[0].ent as Record<string, unknown>).active_listings ?? -1);
      const unlimited = max < 0;
      return {
        entitlements: { maxActiveListings: max, unlimited, planCode: sub[0].code },
        role: unlimited ? "PREMIUM_USER" : "USER",
        dbRole,
      };
    }

    // 3) Varsayılan kullanıcı: haftada 3 ücretsiz ilan (sınırsız değil).
    //    Gerçek sınırlama createUserListing'te haftalık sayımla uygulanır;
    //    bu yalnızca UI'ın doğru mesaj göstermesi için.
    if (!MONETIZATION_ENABLED) {
      return {
        entitlements: { maxActiveListings: WEEKLY_FREE_LIMIT, unlimited: false, planCode: "weekly_free" },
        role: "USER",
        dbRole,
      };
    }
    return {
      entitlements: { maxActiveListings: FREE_MAX_LISTINGS, unlimited: false, planCode: FREE_PLAN_CODE },
      role: "USER",
      dbRole,
    };
  }

  async countActiveListings(userId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(listings)
      .where(
        and(eq(listings.userId, userId), inArray(listings.status, [...ACTIVE_STATUSES])),
      );
    return row?.n ?? 0;
  }

  private async buildAuthUser(
    userId: string,
    name: string,
    phone: string,
  ): Promise<AuthUser> {
    const { entitlements, role } = await this.resolveEntitlements(userId);
    const activeListings = await this.countActiveListings(userId);
    return { id: userId, name, phone, role, entitlements, activeListings };
  }

  private normalizePhone(raw: string): string {
    const digits = raw.replace(/[^\d]/g, "");
    if (raw.startsWith("+")) return raw;
    if (digits.startsWith("994")) return `+${digits}`;
    return `+994${digits}`;
  }
}
