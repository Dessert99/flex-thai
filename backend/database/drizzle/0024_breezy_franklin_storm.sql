ALTER TABLE "vocabulary_extraction_jobs" ADD COLUMN "saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vocabulary_extraction_jobs" ADD COLUMN "receipt" jsonb;