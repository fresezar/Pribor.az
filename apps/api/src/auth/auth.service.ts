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

/** Bireysel kullanıcı ücretsiz aktif ilan limiti (free plan entitlement'ı). */
const FREE_MAX_LISTINGS = 2;
const PRO_PLAN_CODE = "pro_unlimited";
const FREE_PLAN_CODE = "free";
const ACTIVE_STATUSES = ["draft", "pending_review", "active"] as const;

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
        .onConflictDoNothing({ target: plans.code });
      this.logger.log("Planlar hazır (free, pro_unlimited)");
    } catch (err) {
      this.logger.error(`Plan seed hatası: ${String(err)}`);
    }
  }

  async mockLogin(dto: {
    phone: string;
    name: string;
    role: AppUserRole;
  }): Promise<AuthUser> {
    const phone = this.normalizePhone(dto.phone);
    const dbRole = dto.role === "AGENT_ADMIN" ? "agent" : "individual";

    const [row] = await db
      .insert(users)
      .values({ phone, fullName: dto.name, role: dbRole, phoneVerifiedAt: new Date() })
      .onConflictDoUpdate({
        target: users.phone,
        set: { fullName: dto.name, role: dbRole, phoneVerifiedAt: new Date() },
      })
      .returning({ id: users.id });

    if (!row) throw new Error("Kullanıcı upsert edilemedi");
    return this.buildAuthUser(row.id, dto.name, phone);
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

    // 3) Varsayılan: ücretsiz plan (2 aktif ilan)
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
