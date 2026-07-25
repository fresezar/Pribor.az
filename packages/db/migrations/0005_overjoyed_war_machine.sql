DROP INDEX "users_phone_uq";--> statement-breakpoint
ALTER TABLE "otp_codes" ALTER COLUMN "phone" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");