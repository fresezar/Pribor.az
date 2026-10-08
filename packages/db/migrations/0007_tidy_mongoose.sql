CREATE TABLE "owner_feed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_site" varchar(40) NOT NULL,
	"source_ext_id" varchar(80) NOT NULL,
	"url" varchar(300) NOT NULL,
	"deal_type" "deal_type" NOT NULL,
	"property_type" "property_type" NOT NULL,
	"rooms" smallint,
	"area_m2" numeric(8, 1),
	"land_area_sot" numeric(8, 1),
	"floor" smallint,
	"total_floors" smallint,
	"price_azn" integer NOT NULL,
	"district" varchar(60),
	"settlement" varchar(80),
	"has_repair" boolean,
	"title_deed" boolean,
	"posted_at" timestamp with time zone NOT NULL,
	"seller_key" varchar(64),
	"verdict" varchar(16) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delisted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "owner_feed_site_ext_uq" ON "owner_feed" USING btree ("source_site","source_ext_id");--> statement-breakpoint
CREATE INDEX "owner_feed_visible_idx" ON "owner_feed" USING btree ("verdict","posted_at");