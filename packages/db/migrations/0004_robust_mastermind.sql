CREATE TYPE "public"."deal_type" AS ENUM('sale', 'rent');--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "deal_type" "deal_type" DEFAULT 'sale' NOT NULL;