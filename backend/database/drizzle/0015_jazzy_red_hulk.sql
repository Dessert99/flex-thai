CREATE TYPE "public"."content_production_operation" AS ENUM('VOCABULARY_EXTRACTION', 'QUESTION_GENERATION');--> statement-breakpoint
CREATE TYPE "public"."provider_run_status" AS ENUM('STARTED', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_candidate_classification" AS ENUM('NEW_VOCABULARY', 'EXACT_EXISTING_MEANING', 'EXACT_NEW_MEANING', 'POSSIBLE_DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_candidate_group" AS ENUM('NORMAL', 'NEEDS_ATTENTION', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_validation_stage" AS ENUM('SCHEMA', 'DECISION_RULE', 'AI_CROSS_VALIDATION');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_validation_status" AS ENUM('PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."question_major_category" AS ENUM('LISTENING_RESPONSE', 'LISTENING_DIALOGUE', 'LISTENING_PASSAGE', 'READING_VOCABULARY_GRAMMAR', 'READING_SYNONYM_RELATION', 'READING_ERROR_IDENTIFICATION', 'READING_PASSAGE');--> statement-breakpoint
CREATE TYPE "public"."question_taxonomy_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."question_type_version_status" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TABLE "vocabulary_production_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_item_id" uuid NOT NULL,
	"job_attempt" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"thai" text NOT NULL,
	"normalized_thai" text NOT NULL,
	"kind" "vocabulary_kind" NOT NULL,
	"meanings" jsonb NOT NULL,
	"classification" "vocabulary_candidate_classification" NOT NULL,
	"result_group" "vocabulary_candidate_group" NOT NULL,
	"matched_vocabulary_id" uuid,
	"suspected_matches" jsonb NOT NULL,
	"review_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_production_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"stage" "vocabulary_validation_stage" NOT NULL,
	"status" "vocabulary_validation_status" NOT NULL,
	"code" text,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "question_taxonomy_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "question_taxonomy_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_type_approved_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_type_difficulty_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_version_id" uuid NOT NULL,
	"difficulty" integer NOT NULL,
	"criteria" text NOT NULL,
	CONSTRAINT "question_type_difficulty_criteria_level_range" CHECK ("question_type_difficulty_criteria"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "question_version_tags" (
	"question_version_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "question_version_tags_version_tag_unique" UNIQUE("question_version_id","tag_id")
);
--> statement-breakpoint
DROP INDEX "provider_runs_item_operation_attempt_unique";--> statement-breakpoint
ALTER TABLE "provider_runs" ALTER COLUMN "usage" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "provider_runs" ALTER COLUMN "estimated_cost_usd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "provider_runs" ALTER COLUMN "success" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_runs" ALTER COLUMN "started_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "provider_runs" ALTER COLUMN "finished_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "job_input_id" uuid;--> statement-breakpoint
ALTER TABLE "job_items" ADD COLUMN "operation" "content_production_operation";--> statement-breakpoint
ALTER TABLE "provider_runs" ADD COLUMN "sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_runs" ADD COLUMN "prompt_version" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_runs" ADD COLUMN "item_lease_token" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_runs" ADD COLUMN "status" "provider_run_status" DEFAULT 'STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_runs" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "provider_runs" ADD COLUMN "retryable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "question_type_versions" ADD COLUMN "status" "question_type_version_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_types" ADD COLUMN "major_category" "question_major_category";--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
UPDATE "job_items" AS ji
SET
	"job_input_id" = inputs."id",
	"operation" = CASE split_part(ji."source_ref", ':', 3)
		WHEN 'vocabulary' THEN 'VOCABULARY_EXTRACTION'::"content_production_operation"
		WHEN 'question' THEN 'QUESTION_GENERATION'::"content_production_operation"
	END
FROM "job_inputs" AS inputs
WHERE
	inputs."job_id" = ji."job_id"
	AND inputs."ordinal" = substring(ji."source_ref" from '^input:([0-9]+):(vocabulary|question)$')::integer
	AND (ji."job_input_id" IS NULL OR ji."operation" IS NULL);--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "job_items"
		WHERE "job_input_id" IS NULL OR "operation" IS NULL
	) THEN
		RAISE EXCEPTION 'job item input/operation backfill mismatch';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "job_items" ALTER COLUMN "job_input_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_items" ALTER COLUMN "operation" SET NOT NULL;--> statement-breakpoint
INSERT INTO "question_topics" ("id", "slug", "display_name", "status")
VALUES (
	'00000000-0000-4000-8000-000000000320',
	'general',
	'일반',
	'ACTIVE'
);--> statement-breakpoint
UPDATE "question_types"
SET "major_category" = CASE
	WHEN "slug" = 'reading-vocabulary' THEN 'READING_VOCABULARY_GRAMMAR'::"question_major_category"
	WHEN "skill" = 'LISTENING' THEN 'LISTENING_PASSAGE'::"question_major_category"
	ELSE 'READING_PASSAGE'::"question_major_category"
END
WHERE "major_category" IS NULL;--> statement-breakpoint
UPDATE "question_versions"
SET "topic_id" = (
	SELECT "id"
	FROM "question_topics"
	WHERE "slug" = 'general'
)
WHERE "topic_id" IS NULL;--> statement-breakpoint
WITH eligible_versions AS (
	SELECT DISTINCT ON (qtv."question_type_id") qtv."id"
	FROM "question_type_versions" AS qtv
	INNER JOIN "question_versions" AS qv
		ON qv."type_version_id" = qtv."id"
	WHERE qv."validation_status" = 'PASSED'
	ORDER BY qtv."question_type_id", qtv."version" DESC
)
INSERT INTO "question_type_difficulty_criteria" (
	"type_version_id",
	"difficulty",
	"criteria"
)
SELECT
	eligible_versions."id",
	level."difficulty",
	CASE level."difficulty"
		WHEN 1 THEN '기존 검증 문제의 기초 난이도 기준'
		WHEN 2 THEN '기존 검증 문제의 초급 난이도 기준'
		WHEN 3 THEN '기존 검증 문제의 중급 난이도 기준'
		WHEN 4 THEN '기존 검증 문제의 고급 난이도 기준'
		ELSE '기존 검증 문제의 최상급 난이도 기준'
	END
FROM eligible_versions
CROSS JOIN generate_series(1, 5) AS level("difficulty");--> statement-breakpoint
WITH eligible_versions AS (
	SELECT DISTINCT ON (qtv."question_type_id") qtv."id"
	FROM "question_type_versions" AS qtv
	INNER JOIN "question_versions" AS qv
		ON qv."type_version_id" = qtv."id"
	WHERE qv."validation_status" = 'PASSED'
	ORDER BY qtv."question_type_id", qtv."version" DESC
)
UPDATE "question_type_versions" AS qtv
SET "status" = 'ACTIVE'::"question_type_version_status"
FROM eligible_versions
WHERE qtv."id" = eligible_versions."id";--> statement-breakpoint
ALTER TABLE "question_types" ALTER COLUMN "major_category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_versions" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
UPDATE "provider_runs"
SET "status" = CASE
	WHEN "success" IS TRUE THEN 'SUCCEEDED'::"provider_run_status"
	WHEN "success" IS FALSE THEN 'FAILED'::"provider_run_status"
	ELSE 'OUTCOME_UNKNOWN'::"provider_run_status"
END;--> statement-breakpoint
UPDATE "content_production_presets"
SET "parameters" = "parameters" || jsonb_build_object(
	'suspectedDuplicateMaxCodePointDistance',
	1
)
WHERE "id" IN (
	'00000000-0000-4000-8000-000000000901',
	'00000000-0000-4000-8000-000000000903'
);--> statement-breakpoint
ALTER TABLE "vocabulary_production_candidates" ADD CONSTRAINT "vocabulary_production_candidates_job_item_id_job_items_id_fk" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_production_candidates" ADD CONSTRAINT "vocabulary_production_candidates_matched_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("matched_vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_production_validations" ADD CONSTRAINT "vocabulary_production_validations_candidate_id_vocabulary_production_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."vocabulary_production_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_type_approved_examples" ADD CONSTRAINT "question_type_approved_examples_type_version_id_question_type_versions_id_fk" FOREIGN KEY ("type_version_id") REFERENCES "public"."question_type_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_type_difficulty_criteria" ADD CONSTRAINT "question_type_difficulty_criteria_type_version_id_question_type_versions_id_fk" FOREIGN KEY ("type_version_id") REFERENCES "public"."question_type_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_version_tags" ADD CONSTRAINT "question_version_tags_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_version_tags" ADD CONSTRAINT "question_version_tags_tag_id_question_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."question_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_production_candidates_item_attempt_ordinal_unique" ON "vocabulary_production_candidates" USING btree ("job_item_id","job_attempt","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_production_validations_candidate_stage_unique" ON "vocabulary_production_validations" USING btree ("candidate_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "question_tags_slug_unique" ON "question_tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "question_topics_slug_unique" ON "question_topics" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "question_type_approved_examples_payload_unique" ON "question_type_approved_examples" USING btree ("type_version_id","payload_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "question_type_difficulty_criteria_version_level_unique" ON "question_type_difficulty_criteria" USING btree ("type_version_id","difficulty");--> statement-breakpoint
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_job_input_id_job_inputs_id_fk" FOREIGN KEY ("job_input_id") REFERENCES "public"."job_inputs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_topic_id_question_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."question_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_at_id_idx" ON "audit_logs" USING btree ("actor_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_created_at_id_idx" ON "audit_logs" USING btree ("action","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_target_created_at_id_idx" ON "audit_logs" USING btree ("target_type","target_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_updated_at_id_idx" ON "users" USING btree ("updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "provider_runs_item_attempt_operation_sequence_unique" ON "provider_runs" USING btree ("job_item_id","attempt","operation","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "question_type_versions_one_active_per_type" ON "question_type_versions" USING btree ("question_type_id") WHERE "question_type_versions"."status" = 'ACTIVE';
