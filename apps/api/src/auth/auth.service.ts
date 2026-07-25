import { createHash } from "node:crypto";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as nodemailer from "nodemailer";
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
 * Yönetici email'leri — .env ADMIN_EMAILS (virgülle ayrık, küçük harf).
 * Rol istemciden GELMEZ; bu listedeki email ile giriş yapan otomatik
 * admin (AGENT_ADMIN) olur. Böylece istemci kendini yükseltemez.
 */
function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "admin@pribor.az";
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** SMTP yapılandırılmışsa email göndericisi, yoksa null (dev: kodu logla/döndür). */
function mailer(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
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
   * Email'e OTP gönderir: kod hash'lenip otp_codes'a yazılır. SMTP
   * yapılandırılmışsa gerçek email gönderilir; her hâlükârda konsola loglanır
   * ve non-production'da yanıtta devCode döner (arayüz/test kullanabilsin).
   */
  async requestOtp(email: string, purpose = "login"): Promise<OtpRequestResult> {
    const e = this.normalize(email);
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 haneli
    const expiresAt = new Date(Date.now() + OTP_TTL_SEC * 1000);
    await db.insert(otpCodes).values({ phone: e, codeHash: sha256(code), purpose, expiresAt });

    this.logger.log(`OTP → ${e}: ${code}`);
    const transport = mailer();
    if (transport) {
      transport
        .sendMail({
          from: process.env.MAIL_FROM ?? "Pribor <no-reply@pribor.az>",
          to: e,
          subject: `Pribor təsdiq kodu: ${code}`,
          text: `Pribor.az giriş kodunuz: ${code}\nKod 5 dəqiqə etibarlıdır.`,
          html: `<p>Pribor.az giriş kodunuz:</p><h2 style="letter-spacing:4px">${code}</h2><p>Kod 5 dəqiqə etibarlıdır.</p>`,
        })
        .catch((err) => this.logger.error(`Email göndərilə bilmədi: ${String(err)}`));
    }
    const devCode = process.env.NODE_ENV === "production" ? undefined : code;
    return { sent: true, expiresInSec: OTP_TTL_SEC, devCode };
  }

  /** Kodu doğrular ve tüketir (tek kullanımlık). Brute-force freni: 5 deneme. */
  async verifyOtp(email: string, code: string, purpose = "login"): Promise<boolean> {
    const e = this.normalize(email);
    const [row] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, e),
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

  /** Geçerli (süresi dolmamış) promo kodu mu. */
  async isPromoValid(code: string): Promise<boolean> {
    const row = await db.query.promoCodes.findFirst({
      where: eq(promoCodes.code, code.trim()),
    });
    if (!row) return false;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return false;
    return true;
  }

  /** Email normalize — küçük harf + trim. */
  normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Herkes düz kullanıcı olarak girer; rol sunucuda belirlenir:
   * email ADMIN_EMAILS listesindeyse 'admin', değilse 'individual'.
   */
  async mockLogin(dto: { email: string; name: string }): Promise<AuthUser> {
    const email = this.normalize(dto.email);
    const dbRole = adminEmails().includes(email) ? "admin" : "individual";

    const [row] = await db
      .insert(users)
      .values({ email, fullName: dto.name, role: dbRole, verifiedAt: new Date() })
      .onConflictDoUpdate({
        target: users.email,
        set: { fullName: dto.name, role: dbRole, verifiedAt: new Date() },
      })
      .returning({ id: users.id });

    if (!row) throw new Error("Kullanıcı upsert edilemedi");
    if (dbRole === "admin") this.logger.log(`Admin girişi: ${email}`);
    return this.buildAuthUser(row.id, dto.name, email);
  }

  /**
   * OTP ile giriş: kod doğrulanırsa hesabı açar/oluşturur. Doğrulama artık
   * yalnızca burada (girişte) yapılır; ilan formunda tekrar OTP sorulmaz.
   * Kod geçersizse null döner (controller 401 verir).
   */
  async verifyLogin(email: string, name: string, code: string): Promise<AuthUser | null> {
    const ok = await this.verifyOtp(email, code, "login");
    if (!ok) return null;
    return this.mockLogin({ email, name });
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
    return this.buildAuthUser(u.id, u.fullName ?? "İstifadəçi", u.email ?? "");
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

  /** Son 7 günde bu hesabın verdiği ilan sayısı — haftalık limit. */
  async weeklyCountByUser(userId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(listings)
      .where(
        and(
          eq(listings.userId, userId),
          gt(listings.createdAt, sql`now() - interval '7 days'`),
        ),
      );
    return row?.n ?? 0;
  }

  private async buildAuthUser(
    userId: string,
    name: string,
    email: string,
  ): Promise<AuthUser> {
    const { entitlements, role } = await this.resolveEntitlements(userId);
    const activeListings = await this.countActiveListings(userId);
    return { id: userId, name, email, role, entitlements, activeListings };
  }
}
