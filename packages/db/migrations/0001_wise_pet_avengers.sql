ALTER TABLE "listings" ADD COLUMN "contact_name" varchar(120);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;