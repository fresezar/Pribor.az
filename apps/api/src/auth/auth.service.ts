import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { AppUserRole, AuthUser, Entitlements } from "@pribor/contracts";
import {
  and,
  db,
  eq,
  inArray,
  listings,
  plans,
  sql,
  subscriptions,
  users,
} from "@pribor/db";

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

    // 3) Varsayılan kullanıcı. Monetizasyon ertelendiği için şimdilik sınırsız.
    if (!MONETIZATION_ENABLED) {
      return {
        entitlements: { maxActiveListings: -1, unlimited: true, planCode: "free_unlimited" },
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
