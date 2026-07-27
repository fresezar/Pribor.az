import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { modelStatus, valuationChannel, vertical } from "./enums";
import { listings } from "./listings";
import { locations } from "./locations";
import { users } from "./users";

/** MLflow registry'nin DB'deki izdüşümü — her tahmin bir model sürümüne bağlanır. */
export const modelVersions = pgTable(
  "model_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vertical: vertical("vertical").notNull(),
    /** örn. "re-catboost-q-2026.07.1" */
    tag: varchar("tag", { length: 80 }).notNull(),
    algo: varchar("algo", { length: 40 }).notNull().default("catboost_quantile"),
    /** {"mape": 0.089, "coverage_p10_p90": 0.81, "n_train": 142000} */
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    artifactUri: varchar("artifact_uri", { length: 255 }),
    status: modelStatus("status").notNull().default("staging"),
    trainedAt: timestamp("trained_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("model_versions_vertical_status_idx").on(t.vertical, t.status),
    // API, ML'den dönen tag'i idempotent kaydeder (onConflictDoNothing)
    uniqueIndex("model_versions_tag_uq").on(t.tag),
  ],
);

/**
 * Her değerleme kalıcı bir olaydır: model izleme, funnel analizi,
 * "Deal Radar" ve Qiymət Sertifikatı bu tablodan beslenir.
 */
export const valuations = pgTable(
  "valuations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Anonim değerlemede null — oturum açmadan da değerleme yapılabilir. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    vertical: vertical("vertical").notNull(),
    channel: valuationChannel("channel").notNull().default("web"),
    /** Kullanıcının girdiği ham feature seti — contracts.ValuationRequest şekli. */
    inputFeatures: jsonb("input_features").$type<Record<string, unknown>>().notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => modelVersions.id),
    /**
     * İki aralık saklanır: P25–P75 kullanıcıya "ehtimal olunan" olarak,
     * P10–P90 "geniş" olarak gösterilir. Dar aralık nullable — eski
     * değerlemeler üç quantile ile üretilmişti, geriye dönük doldurulamaz
     * (o modeller artık yok). Okuyan taraf boşluğu tolere etmeli.
     */
    p10Azn: integer("p10_azn").notNull(),
    p25Azn: integer("p25_azn"),
    p50Azn: integer("p50_azn").notNull(),
    p75Azn: integer("p75_azn"),
    p90Azn: integer("p90_azn").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    /** SHAP top-N: [{feature, label, contribution_azn}] — "Qiymət DNT-si". */
    shapTop: jsonb("shap_top").$type<Array<Record<string, unknown>>>().notNull().default([]),
    /** Kıyas ilanları — sonuç ekranındaki kanıt kartları. */
    compListingIds: uuid("comp_listing_ids").array(),
    /**
     * Truva atı metriği: bu değerleme ilana dönüştü mü?
     * Dolu ise funnel'ın en değerli dönüşümü gerçekleşmiş demektir.
     */
    convertedListingId: uuid("converted_listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("valuations_user_idx").on(t.userId, t.createdAt),
    index("valuations_vertical_created_idx").on(t.vertical, t.createdAt),
    index("valuations_model_idx").on(t.modelVersionId),
  ],
);
