ALTER TABLE "vocabularies" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
UPDATE "vocabularies"
SET "published_at" = "updated_at"
WHERE "status" = 'PUBLISHED';
