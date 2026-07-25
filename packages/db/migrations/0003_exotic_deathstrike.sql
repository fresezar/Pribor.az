CREATE TABLE "promo_codes" (
	"code" varchar(50) PRIMARY KEY NOT NULL,
	"label" varchar(120),
	"is_unlimited_admin" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "verification_phone" varchar(20);--> statement-breakpoint
CREATE INDEX "listings_vphone_created_idx" ON "listings" USING btree ("verification_phone","created_at");