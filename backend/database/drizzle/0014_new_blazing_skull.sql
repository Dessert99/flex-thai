CREATE TYPE "public"."content_production_purpose" AS ENUM('VOCABULARY_EXTRACTION', 'QUESTION_GENERATION', 'VOCABULARY_THEN_QUESTION_GENERATION');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_meaning_relation_direction" AS ENUM('DIRECTED', 'BIDIRECTIONAL');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_meaning_relation_status" AS ENUM('PENDING', 'PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_meaning_relation_type" AS ENUM('SYNONYM', 'ANTONYM', 'RELATED');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'VOCABULARY_EXTRACTION' BEFORE 'QUESTION_GENERATION';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'VOCABULARY_THEN_QUESTION_GENERATION';--> statement-breakpoint
ALTER TYPE "public"."vocabulary_status" ADD VALUE 'MERGED';--> statement-breakpoint
CREATE TABLE "content_production_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"purpose" "content_production_purpose" NOT NULL,
	"version" integer NOT NULL,
	"parameters" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_meaning_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_meaning_id" uuid NOT NULL,
	"target_meaning_id" uuid NOT NULL,
	"type" "vocabulary_meaning_relation_type" NOT NULL,
	"direction" "vocabulary_meaning_relation_direction" NOT NULL,
	"status" "vocabulary_meaning_relation_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_meaning_relations_unique" UNIQUE("source_meaning_id","target_meaning_id","type","direction"),
	CONSTRAINT "vocabulary_meaning_relations_not_self" CHECK ("vocabulary_meaning_relations"."source_meaning_id" <> "vocabulary_meaning_relations"."target_meaning_id"),
	CONSTRAINT "vocabulary_meaning_relations_bidirectional_order" CHECK ("vocabulary_meaning_relations"."direction" <> 'BIDIRECTIONAL' or "vocabulary_meaning_relations"."source_meaning_id" < "vocabulary_meaning_relations"."target_meaning_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_merge_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_vocabulary_id" uuid NOT NULL,
	"representative_vocabulary_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"representative_snapshot" jsonb NOT NULL,
	"moved_counts" jsonb NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"merged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vocabulary_merge_history_distinct_vocabularies" CHECK ("vocabulary_merge_history"."source_vocabulary_id" <> "vocabulary_merge_history"."representative_vocabulary_id")
);
--> statement-breakpoint
ALTER TABLE "job_inputs" ADD COLUMN "ordinal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "retryable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "purpose" "content_production_purpose";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "preset_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "preset_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vocabularies" ADD COLUMN "merged_into_vocabulary_id" uuid;--> statement-breakpoint
ALTER TABLE "vocabulary_meaning_relations" ADD CONSTRAINT "vocabulary_meaning_relations_source_meaning_id_vocabulary_meanings_id_fk" FOREIGN KEY ("source_meaning_id") REFERENCES "public"."vocabulary_meanings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_meaning_relations" ADD CONSTRAINT "vocabulary_meaning_relations_target_meaning_id_vocabulary_meanings_id_fk" FOREIGN KEY ("target_meaning_id") REFERENCES "public"."vocabulary_meanings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_merge_history" ADD CONSTRAINT "vocabulary_merge_history_source_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("source_vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_merge_history" ADD CONSTRAINT "vocabulary_merge_history_representative_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("representative_vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_merge_history" ADD CONSTRAINT "vocabulary_merge_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_production_presets_name_version_unique" ON "content_production_presets" USING btree ("name","version");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_preset_id_content_production_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."content_production_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabularies" ADD CONSTRAINT "vocabularies_merged_into_fk" FOREIGN KEY ("merged_into_vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_items_job_source_unique" ON "job_items" USING btree ("job_id","source_ref");--> statement-breakpoint
ALTER TABLE "vocabularies" ADD CONSTRAINT "vocabularies_merge_state_match" CHECK (("vocabularies"."status"::text = 'MERGED' and "vocabularies"."merged_into_vocabulary_id" is not null and "vocabularies"."merged_into_vocabulary_id" <> "vocabularies"."id") or ("vocabularies"."status"::text <> 'MERGED' and "vocabularies"."merged_into_vocabulary_id" is null));--> statement-breakpoint
ALTER TABLE "vocabulary_meaning_pronunciations" ALTER CONSTRAINT "vocabulary_meaning_pronunciations_meaning_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "vocabulary_meaning_pronunciations" ALTER CONSTRAINT "vocabulary_meaning_pronunciations_pronunciation_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "token_occurrences" ALTER CONSTRAINT "token_occurrences_meaning_vocabulary_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "token_occurrences" ALTER CONSTRAINT "token_occurrences_pronunciation_vocabulary_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER CONSTRAINT "expression_occurrences_meaning_vocabulary_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER CONSTRAINT "expression_occurrences_pronunciation_vocabulary_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" ALTER CONSTRAINT "vocabulary_practice_questions_meaning_vocabulary_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" ALTER CONSTRAINT "vocabulary_practice_questions_pronunciation_vocabulary_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
INSERT INTO "content_production_presets" ("id", "name", "purpose", "version", "parameters", "enabled")
VALUES
	('00000000-0000-4000-8000-000000000901', '기본 어휘 추출', 'VOCABULARY_EXTRACTION', 1, '{}'::jsonb, true),
	('00000000-0000-4000-8000-000000000902', '기본 문제 생성', 'QUESTION_GENERATION', 1, '{}'::jsonb, true),
	('00000000-0000-4000-8000-000000000903', '기본 어휘·문제 생성', 'VOCABULARY_THEN_QUESTION_GENERATION', 1, '{}'::jsonb, true);
