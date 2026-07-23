import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  paymentProvider,
  paymentPurpose,
  paymentStatus,
  planPeriod,
  subscriptionStatus,
} from "./enums";
import { listings } from "./listings";
import { users } from "./users";

/**
 * BILLING MODÜLÜ — Faz 3'e kadar uykuda. Şema ilk günden hazır;
 * aktivasyon yalnızca feature flag + plan satırları eklemekten ibarettir.
 *
 * Modülerlik anahtarı: yetkiler kodda değil `plans.entitlements` JSONB'sinde
 * yaşar. Backend tek kapıdan sorar: can(user, "boost") →
 * aktif aboneliğin planındaki entitlements sözlüğüne bakar.
 */

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "free" | "pro_agent" | "dealer_bulk" ... */
    code: varchar("code", { length: 40 }).notNull(),
    /** {"az": "Pro Emlakçı", "ru": "Про Риелтор", "en": "Pro Agent"} */
    name: jsonb("name").$type<Record<string, string>>().notNull(),
    period: planPeriod("period").notNull().default("monthly"),
    /** Qəpik hassasiyeti (1 AZN = 100 qəpik) — kayan nokta parayla asla. */
    priceQepik: integer("price_qepik").notNull().default(0),
    /**
     * Yetki sözlüğü, örn:
     * {"active_listings": 50, "boosts_monthly": 10, "deal_radar": true,
     *  "certificates_monthly": 20, "bulk_import": true}
     */
    entitlements: jsonb("entitlements").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plans_code_uq").on(t.code)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
  },
  (t) => [index("subscriptions_user_status_idx").on(t.userId, t.status)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    provider: paymentProvider("provider").notNull(),
    /** PSP'nin işlem kimliği — mutabakat (reconciliation) anahtarı. */
    providerTxnId: varchar("provider_txn_id", { length: 120 }),
    amountQepik: integer("amount_qepik").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("AZN"),
    purpose: paymentPurpose("purpose").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    /** Amaca göre ilişki: listing_fee/boost → listings, subscription → subscriptions. */
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    /** PSP callback ham gövdesi — uyuşmazlıkta kanıt. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    index("payments_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("payments_provider_txn_uq").on(t.provider, t.providerTxnId),
    check("payments_amount_positive", sql`${t.amountQepik} > 0`),
  ],
);
