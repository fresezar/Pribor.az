import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { moderationStatus, reviewTargetType } from "./enums";
import { users } from "./users";

/**
 * REVIEWS MODÜLÜ — Faz 3'e kadar uykuda.
 * Polimorfik hedef: (target_type, target_id) ikilisi user veya organization
 * gösterir. FK yerine uygulama katmanı doğrulaması — polimorfizmin bilinen
 * takası; bütünlük check + moderasyon akışıyla korunur.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: reviewTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    rating: smallint("rating").notNull(),
    body: text("body"),
    moderationStatus: moderationStatus("moderation_status").notNull().default("pending"),
    moderatedBy: uuid("moderated_by").references(() => users.id),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Bir yazar bir hedefe tek yorum — düzenleme update ile
    uniqueIndex("reviews_author_target_uq").on(t.authorId, t.targetType, t.targetId),
    index("reviews_target_idx").on(t.targetType, t.targetId, t.moderationStatus),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);
