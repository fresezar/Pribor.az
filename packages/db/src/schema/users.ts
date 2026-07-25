import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locale, orgType, userRole, verifiedStatus } from "./enums";

/**
 * Kimlik telefon-öncelikli: `phone` (E.164, örn. +99450XXXXXXX) birincil giriş
 * kimliğidir; e-posta opsiyoneldir. OTP akışı otp_codes üzerinden yürür.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Hesap kimliği: giriş email'i (OTP buraya gider). Küçük harf saklanır. */
    email: varchar("email", { length: 255 }),
    /** Doğrulama girişte yapılır; giriş anı verified sayılır. */
    verifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    /** Opsiyonel — kişisel iletişim; ilan iletişim numarası ayrı (listings.contact_phone). */
    phone: varchar("phone", { length: 20 }),
    fullName: varchar("full_name", { length: 120 }),
    role: userRole("role").notNull().default("individual"),
    locale: locale("locale").notNull().default("az"),
    /** {"deal_radar": true, "price_drop": true, "channel": "telegram"} */
    notificationPrefs: jsonb("notification_prefs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    telegramChatId: varchar("telegram_chat_id", { length: 32 }),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

/**
 * OTP kodları — kod asla düz metin saklanmaz (SHA-256 hash).
 * attempts ile brute-force freni; expires_at sonrası kod geçersiz.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** OTP hedefi — email (255'e genişletildi; kolon adı geriye dönük 'phone'). */
    phone: varchar("phone", { length: 255 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    purpose: varchar("purpose", { length: 20 }).notNull().default("login"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_phone_idx").on(t.phone, t.createdAt)],
);

/** Emlak ofisleri ve oto galeriler — kurumsal ilan sahipleri. */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: orgType("type").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    description: text("description"),
    phone: varchar("phone", { length: 20 }),
    verifiedStatus: verifiedStatus("verified_status").notNull().default("unverified"),
    /** Vitrin sayfası ayarları, logo storage key vb. */
    profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("orgs_slug_uq").on(t.slug)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isOwner: boolean("is_owner").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);
