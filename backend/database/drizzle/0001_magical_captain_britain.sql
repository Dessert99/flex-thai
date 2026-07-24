CREATE TYPE "public"."auth_challenge_purpose" AS ENUM('SIGNUP', 'PASSWORD_RESET');--> statement-breakpoint
DROP INDEX "auth_challenges_email_hash_idx";--> statement-breakpoint
TRUNCATE TABLE "auth_challenges";--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "purpose" "auth_challenge_purpose" NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_challenges_email_created_at_idx" ON "auth_challenges" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "auth_challenges_created_at_idx" ON "auth_challenges" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "auth_challenges" DROP COLUMN "email_hash";--> statement-breakpoint
ALTER TABLE "auth_challenges" DROP COLUMN "cognito_session_ciphertext";--> statement-breakpoint
ALTER TABLE "auth_challenges" DROP COLUMN "link_hmac";
