import { pgEnum } from "drizzle-orm/pg-core";

/**
 * DB enum'ları — @pribor/contracts/src/enums.ts ile birebir senkron tutulur.
 * Yeni değer eklerken iki dosyayı birlikte güncelle ve migration üret.
 */

export const userRole = pgEnum("user_role", [
  "individual", // bireysel kullanıcı
  "agent",      // emlakçı
  "dealer",     // galeri
  "admin",
]);

export const orgType = pgEnum("org_type", ["agency", "gallery"]);

export const verifiedStatus = pgEnum("verified_status", [
  "unverified",
  "pending",
  "verified",
]);

export const locale = pgEnum("locale", ["az", "ru", "en"]);

export const vertical = pgEnum("vertical", ["real_estate", "vehicle"]);

export const listingStatus = pgEnum("listing_status", [
  "draft",
  "pending_review",
  "active",
  "sold",
  "expired",
  "removed",
]);

export const listingSource = pgEnum("listing_source", ["user", "scraped"]);

export const propertyType = pgEnum("property_type", [
  "apartment",
  "house",
  "land",
  "commercial",
  "office",
  "garage",
]);

export const buildingType = pgEnum("building_type", [
  "yeni_tikili",
  "kohne_tikili",
  "stalinka",
]);

export const fuelType = pgEnum("fuel_type", [
  "petrol",
  "diesel",
  "gas",
  "hybrid",
  "electric",
]);

export const transmission = pgEnum("transmission", [
  "manual",
  "automatic",
  "robot",
  "variator",
]);

export const mediaKind = pgEnum("media_kind", ["photo", "video"]);

export const valuationChannel = pgEnum("valuation_channel", [
  "web",
  "mobile",
  "telegram",
  "api",
]);

export const modelStatus = pgEnum("model_status", [
  "staging",
  "production",
  "archived",
]);

export const scrapeRunType = pgEnum("scrape_run_type", ["delta", "full"]);

export const scrapeRunStatus = pgEnum("scrape_run_status", [
  "running",
  "succeeded",
  "failed",
  "partial",
]);

// --- billing (uykuda — Faz 3'te feature flag ile uyanır) ---

export const planPeriod = pgEnum("plan_period", ["monthly", "yearly", "one_time"]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);

export const paymentProvider = pgEnum("payment_provider", [
  "payriff",
  "epoint",
  "iap_apple",
  "iap_google",
  "manual",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);

export const paymentPurpose = pgEnum("payment_purpose", [
  "listing_fee",
  "boost",
  "subscription",
  "certificate",
]);

// --- reviews (uykuda — Faz 3) ---

export const reviewTargetType = pgEnum("review_target_type", [
  "user",
  "organization",
]);

export const moderationStatus = pgEnum("moderation_status", [
  "pending",
  "approved",
  "rejected",
]);
