CREATE TYPE "public"."building_type" AS ENUM('yeni_tikili', 'kohne_tikili', 'stalinka');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('petrol', 'diesel', 'gas', 'hybrid', 'electric');--> statement-breakpoint
CREATE TYPE "public"."listing_source" AS ENUM('user', 'scraped');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'pending_review', 'active', 'sold', 'expired', 'removed');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('az', 'ru', 'en');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'video');--> statement-breakpoint
CREATE TYPE "public"."model_status" AS ENUM('staging', 'production', 'archived');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('agency', 'gallery');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('payriff', 'epoint', 'iap_apple', 'iap_google', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('listing_fee', 'boost', 'subscription', 'certificate');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."plan_period" AS ENUM('monthly', 'yearly', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."price_ref_kind" AS ENUM('listing', 'scraped');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('apartment', 'house', 'land', 'commercial', 'office', 'garage');--> statement-breakpoint
CREATE TYPE "public"."review_target_type" AS ENUM('user', 'organization');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_status" AS ENUM('running', 'succeeded', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_type" AS ENUM('delta', 'full');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."transmission" AS ENUM('manual', 'automatic', 'robot', 'variator');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('individual', 'agent', 'dealer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."valuation_channel" AS ENUM('web', 'mobile', 'telegram', 'api');--> statement-breakpoint
CREATE TYPE "public"."verified_status" AS ENUM('unverified', 'pending', 'verified');--> statement-breakpoint
CREATE TYPE "public"."vertical" AS ENUM('real_estate', 'vehicle');--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "org_type" NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"description" text,
	"phone" varchar(20),
	"verified_status" "verified_status" DEFAULT 'unverified' NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"purpose" varchar(20) DEFAULT 'login' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"email" varchar(255),
	"full_name" varchar(120),
	"role" "user_role" DEFAULT 'individual' NOT NULL,
	"locale" "locale" DEFAULT 'az' NOT NULL,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"telegram_chat_id" varchar(32),
	"banned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" varchar(60) DEFAULT 'Bakı' NOT NULL,
	"district" varchar(60),
	"settlement" varchar(80),
	"address_line" varchar(255),
	"point" geometry(point),
	"nearest_metro_id" uuid,
	"metro_dist_m" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metro_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_az" varchar(80) NOT NULL,
	"name_ru" varchar(80),
	"line" varchar(40),
	"point" geometry(point) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_re_attrs" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"property_type" "property_type" NOT NULL,
	"area_m2" numeric(8, 1),
	"land_area_sot" numeric(8, 1),
	"rooms" smallint,
	"floor" smallint,
	"total_floors" smallint,
	"building_type" "building_type",
	"repair_state" smallint,
	"title_deed" boolean,
	"mortgage_eligible" boolean,
	CONSTRAINT "re_repair_state_range" CHECK ("listing_re_attrs"."repair_state" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "listing_vehicle_attrs" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"make" varchar(60) NOT NULL,
	"model" varchar(60) NOT NULL,
	"year" smallint NOT NULL,
	"mileage_km" integer,
	"engine_l" numeric(3, 1),
	"fuel_type" "fuel_type",
	"transmission" "transmission",
	"body_type" varchar(40),
	"color" varchar(30),
	"accident_free" boolean,
	"customs_cleared" boolean,
	"vin" varchar(17)
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical" "vertical" NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"source" "listing_source" DEFAULT 'user' NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"location_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"price_azn" integer NOT NULL,
	"contact_phone" varchar(20),
	"valuation_id" uuid,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"boosted_until" timestamp with time zone,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_price_positive" CHECK ("listings"."price_azn" > 0)
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"kind" "media_kind" DEFAULT 'photo' NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"width" smallint,
	"height" smallint,
	"order_idx" smallint DEFAULT 0 NOT NULL,
	"phash" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"ref_kind" "price_ref_kind" DEFAULT 'listing' NOT NULL,
	"ref_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"price_azn" integer NOT NULL,
	"source" varchar(40) DEFAULT 'user' NOT NULL,
	CONSTRAINT "price_snapshots_ref_kind_ref_id_observed_at_pk" PRIMARY KEY("ref_kind","ref_id","observed_at")
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical" "vertical" NOT NULL,
	"tag" varchar(80) NOT NULL,
	"algo" varchar(40) DEFAULT 'catboost_quantile' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"artifact_uri" varchar(255),
	"status" "model_status" DEFAULT 'staging' NOT NULL,
	"trained_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"vertical" "vertical" NOT NULL,
	"channel" "valuation_channel" DEFAULT 'web' NOT NULL,
	"input_features" jsonb NOT NULL,
	"location_id" uuid,
	"model_version_id" uuid NOT NULL,
	"p10_azn" integer NOT NULL,
	"p50_azn" integer NOT NULL,
	"p90_azn" integer NOT NULL,
	"confidence" numeric(4, 3),
	"shap_top" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comp_listing_ids" uuid[],
	"converted_listing_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_dumps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source_site" varchar(60) NOT NULL,
	"source_ext_id" varchar(80) NOT NULL,
	"url" varchar(500) NOT NULL,
	"http_status" integer,
	"storage_key" varchar(255) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_site" varchar(60) NOT NULL,
	"run_type" "scrape_run_type" NOT NULL,
	"status" "scrape_run_status" DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scraped_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_dump_id" uuid NOT NULL,
	"source_site" varchar(60) NOT NULL,
	"source_ext_id" varchar(80) NOT NULL,
	"vertical" "vertical" NOT NULL,
	"normalized" jsonb NOT NULL,
	"price_azn" integer,
	"dedup_cluster_id" varchar(64),
	"matched_listing_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"delisted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_txn_id" varchar(120),
	"amount_qepik" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AZN' NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"listing_id" uuid,
	"subscription_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_qepik" > 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" jsonb NOT NULL,
	"period" "plan_period" DEFAULT 'monthly' NOT NULL,
	"price_qepik" integer DEFAULT 0 NOT NULL,
	"entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"renews_at" timestamp with time zone,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"target_type" "review_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text,
	"moderation_status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_nearest_metro_id_metro_stations_id_fk" FOREIGN KEY ("nearest_metro_id") REFERENCES "public"."metro_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_re_attrs" ADD CONSTRAINT "listing_re_attrs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_vehicle_attrs" ADD CONSTRAINT "listing_vehicle_attrs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_converted_listing_id_listings_id_fk" FOREIGN KEY ("converted_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_dumps" ADD CONSTRAINT "raw_dumps_run_id_scrape_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_listings" ADD CONSTRAINT "scraped_listings_raw_dump_id_raw_dumps_id_fk" FOREIGN KEY ("raw_dump_id") REFERENCES "public"."raw_dumps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_listings" ADD CONSTRAINT "scraped_listings_matched_listing_id_listings_id_fk" FOREIGN KEY ("matched_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "locations_district_idx" ON "locations" USING btree ("district");--> statement-breakpoint
CREATE INDEX "locations_point_gist" ON "locations" USING gist ("point");--> statement-breakpoint
CREATE UNIQUE INDEX "metro_name_az_uq" ON "metro_stations" USING btree ("name_az");--> statement-breakpoint
CREATE INDEX "metro_point_gist" ON "metro_stations" USING gist ("point");--> statement-breakpoint
CREATE INDEX "re_attrs_type_rooms_idx" ON "listing_re_attrs" USING btree ("property_type","rooms");--> statement-breakpoint
CREATE INDEX "veh_attrs_make_model_year_idx" ON "listing_vehicle_attrs" USING btree ("make","model","year");--> statement-breakpoint
CREATE INDEX "listings_status_vertical_idx" ON "listings" USING btree ("status","vertical");--> statement-breakpoint
CREATE INDEX "listings_location_idx" ON "listings" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "listings_user_idx" ON "listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listings_published_idx" ON "listings" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "media_listing_idx" ON "media" USING btree ("listing_id","order_idx");--> statement-breakpoint
CREATE INDEX "media_phash_idx" ON "media" USING btree ("phash");--> statement-breakpoint
CREATE INDEX "model_versions_vertical_status_idx" ON "model_versions" USING btree ("vertical","status");--> statement-breakpoint
CREATE UNIQUE INDEX "model_versions_tag_uq" ON "model_versions" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "valuations_user_idx" ON "valuations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "valuations_vertical_created_idx" ON "valuations" USING btree ("vertical","created_at");--> statement-breakpoint
CREATE INDEX "valuations_model_idx" ON "valuations" USING btree ("model_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_dumps_site_ext_hash_uq" ON "raw_dumps" USING btree ("source_site","source_ext_id","content_hash");--> statement-breakpoint
CREATE INDEX "raw_dumps_run_idx" ON "raw_dumps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "scrape_runs_site_started_idx" ON "scrape_runs" USING btree ("source_site","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scraped_site_ext_uq" ON "scraped_listings" USING btree ("source_site","source_ext_id");--> statement-breakpoint
CREATE INDEX "scraped_vertical_seen_idx" ON "scraped_listings" USING btree ("vertical","last_seen_at");--> statement-breakpoint
CREATE INDEX "scraped_dedup_idx" ON "scraped_listings" USING btree ("dedup_cluster_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_txn_uq" ON "payments" USING btree ("provider","provider_txn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_uq" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_author_target_uq" ON "reviews" USING btree ("author_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "reviews_target_idx" ON "reviews" USING btree ("target_type","target_id","moderation_status");