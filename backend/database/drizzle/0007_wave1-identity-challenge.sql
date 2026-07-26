CREATE TYPE "public"."email_challenge_delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."email_challenge_status" AS ENUM('PENDING', 'RESERVED', 'SUCCEEDED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."auth_challenge_purpose_wave1" AS ENUM('SIGNUP', 'PASSWORD_RESET', 'LOGIN');--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "purpose" TYPE "public"."auth_challenge_purpose_wave1" USING "purpose"::text::"public"."auth_challenge_purpose_wave1";--> statement-breakpoint
DROP TYPE "public"."auth_challenge_purpose";--> statement-breakpoint
ALTER TYPE "public"."auth_challenge_purpose_wave1" RENAME TO "auth_challenge_purpose";--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "purpose" SET DEFAULT 'LOGIN';--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "status" SET DATA TYPE "public"."email_challenge_status" USING (
	CASE
		WHEN "status"::text = 'CANCELLED' THEN 'EXPIRED'
		ELSE "status"::text
	END
)::"public"."email_challenge_status";--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "link_hmac" text;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "resend_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "reserved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "delivery_status" "email_challenge_delivery_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
UPDATE "auth_challenges"
SET
	"link_hmac" = 'legacy-unusable:' || "id"::text,
	"resend_at" = "expires_at";--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "link_hmac" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "resend_at" SET NOT NULL;
