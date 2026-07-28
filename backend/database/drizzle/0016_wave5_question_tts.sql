CREATE TYPE "public"."question_candidate_group" AS ENUM('NORMAL', 'NEEDS_ATTENTION', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."question_candidate_payload_state" AS ENUM('CANONICAL', 'REDACTED_INVALID');--> statement-breakpoint
CREATE TYPE "public"."question_candidate_review_status" AS ENUM('PENDING', 'APPROVED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."question_production_validation_status" AS ENUM('PASSED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."question_validation_stage" AS ENUM('SCHEMA', 'DECISION_RULE', 'SIMILARITY', 'AI_CROSS_VALIDATION');--> statement-breakpoint
CREATE TYPE "public"."tts_audio_cache_status" AS ENUM('PENDING', 'GENERATING', 'READY', 'FAILED', 'OUTCOME_UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."tts_audio_gc_status" AS ENUM('PENDING', 'PROCESSING', 'REFERENCED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."tts_item_status" AS ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."tts_job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIALLY_FAILED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."tts_provider_run_status" AS ENUM('STARTED', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."tts_target_kind" AS ENUM('VOCABULARY_PRONUNCIATION', 'EXPRESSION', 'THAI_SENTENCE_VERSION', 'CONCEPT_SENTENCE');--> statement-breakpoint
CREATE TYPE "public"."async_dispatch_payload_kind" AS ENUM('CONTENT_PRODUCTION', 'TTS');--> statement-breakpoint
CREATE TABLE "question_production_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_item_id" uuid NOT NULL,
	"job_attempt" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"type_version_id" uuid NOT NULL,
	"payload_state" "question_candidate_payload_state" NOT NULL,
	"topic_id" uuid,
	"difficulty" integer,
	"payload" jsonb,
	"payload_hash" text NOT NULL,
	"result_group" "question_candidate_group" NOT NULL,
	"review_status" "question_candidate_review_status" DEFAULT 'PENDING' NOT NULL,
	"review_code" text,
	"regenerated_from_candidate_id" uuid,
	"approved_question_id" uuid,
	"approved_question_version_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_production_candidates_attempt_nonnegative" CHECK ("question_production_candidates"."job_attempt" >= 0),
	CONSTRAINT "question_production_candidates_ordinal_nonnegative" CHECK ("question_production_candidates"."ordinal" >= 0),
	CONSTRAINT "question_production_candidates_difficulty_range" CHECK ("question_production_candidates"."difficulty" between 1 and 5),
	CONSTRAINT "question_production_candidates_payload_hash_sha256" CHECK ("question_production_candidates"."payload_hash" ~ '^[0-9A-Fa-f]{64}$'),
	CONSTRAINT "question_production_candidates_payload_representation_consistency" CHECK (("question_production_candidates"."payload_state" = 'CANONICAL' and "question_production_candidates"."topic_id" is not null and "question_production_candidates"."difficulty" is not null and "question_production_candidates"."payload" is not null) or ("question_production_candidates"."payload_state" = 'REDACTED_INVALID' and "question_production_candidates"."topic_id" is null and "question_production_candidates"."difficulty" is null and "question_production_candidates"."payload" is null and "question_production_candidates"."result_group" = 'FAILED' and "question_production_candidates"."review_status" <> 'APPROVED' and "question_production_candidates"."approved_question_id" is null and "question_production_candidates"."approved_question_version_id" is null)),
	CONSTRAINT "question_production_candidates_revision_nonnegative" CHECK ("question_production_candidates"."revision" >= 0),
	CONSTRAINT "question_production_candidates_review_approval_consistency" CHECK (("question_production_candidates"."review_status" = 'APPROVED' and "question_production_candidates"."approved_question_id" is not null and "question_production_candidates"."approved_question_version_id" is not null) or ("question_production_candidates"."review_status" <> 'APPROVED' and "question_production_candidates"."approved_question_id" is null and "question_production_candidates"."approved_question_version_id" is null))
);
--> statement-breakpoint
CREATE TABLE "question_production_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"stage" "question_validation_stage" NOT NULL,
	"status" "question_production_validation_status" NOT NULL,
	"code" text,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tts_audio_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"audio_digest" text,
	"status" "tts_audio_cache_status" DEFAULT 'GENERATING' NOT NULL,
	"generation_attempt" integer DEFAULT 1 NOT NULL,
	"claim_token" text,
	"claimed_at" timestamp with time zone,
	"error_code" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"media_asset_id" uuid,
	"ready_metadata_revision" text,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tts_audio_cache_ready_metadata_consistent" CHECK ("tts_audio_cache"."status" <> 'READY' or ("tts_audio_cache"."media_asset_id" is not null and "tts_audio_cache"."ready_metadata_revision" is not null and "tts_audio_cache"."ready_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "tts_audio_gc_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "tts_audio_gc_status" DEFAULT 'PENDING' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"referenced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tts_audio_gc_records_size_safe_integer" CHECK ("tts_audio_gc_records"."size_bytes" > 0 and "tts_audio_gc_records"."size_bytes" <= 9007199254740991),
	CONSTRAINT "tts_audio_gc_records_sha256_length" CHECK ("tts_audio_gc_records"."sha256" ~ '^[0-9A-Fa-f]{64}$'),
	CONSTRAINT "tts_audio_gc_records_attempts_non_negative" CHECK ("tts_audio_gc_records"."processing_attempts" >= 0),
	CONSTRAINT "tts_audio_gc_records_lease_pair_consistent" CHECK (("tts_audio_gc_records"."lease_owner" is null) = ("tts_audio_gc_records"."lease_expires_at" is null)),
	CONSTRAINT "tts_audio_gc_records_terminal_consistent" CHECK (("tts_audio_gc_records"."status" = 'REFERENCED' and "tts_audio_gc_records"."referenced_at" is not null and "tts_audio_gc_records"."deleted_at" is null) or ("tts_audio_gc_records"."status" = 'DELETED' and "tts_audio_gc_records"."deleted_at" is not null and "tts_audio_gc_records"."referenced_at" is null) or ("tts_audio_gc_records"."status" in ('PENDING', 'PROCESSING') and "tts_audio_gc_records"."referenced_at" is null and "tts_audio_gc_records"."deleted_at" is null))
);
--> statement-breakpoint
CREATE TABLE "tts_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"target_kind" "tts_target_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"target_text" text NOT NULL,
	"target_required" boolean NOT NULL,
	"revision" text NOT NULL,
	"voice_snapshot" jsonb NOT NULL,
	"cache_key" text NOT NULL,
	"status" "tts_item_status" DEFAULT 'PENDING' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"error_code" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"media_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tts_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"voice_snapshot" jsonb NOT NULL,
	"dispatch_attempt" integer DEFAULT 0 NOT NULL,
	"last_dispatch_command_fingerprint" text,
	"status" "tts_job_status" DEFAULT 'QUEUED' NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	"processing_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tts_provider_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"cache_key" text NOT NULL,
	"cache_claim_token" text NOT NULL,
	"item_lease_token" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" "tts_provider_run_status" DEFAULT 'STARTED' NOT NULL,
	"usage" jsonb,
	"estimated_cost_usd" numeric(18, 8),
	"provider_request_id" text,
	"error_code" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"storage_key" text,
	"storage_mime_type" text,
	"storage_size_bytes" bigint,
	"storage_sha256" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tts_provider_runs_attempt_non_negative" CHECK ("tts_provider_runs"."attempt" >= 0),
	CONSTRAINT "tts_provider_runs_storage_metadata_consistent" CHECK (("tts_provider_runs"."storage_key" is null and "tts_provider_runs"."storage_mime_type" is null and "tts_provider_runs"."storage_size_bytes" is null and "tts_provider_runs"."storage_sha256" is null) or ("tts_provider_runs"."storage_key" is not null and "tts_provider_runs"."storage_mime_type" is not null and "tts_provider_runs"."storage_size_bytes" > 0 and "tts_provider_runs"."storage_size_bytes" <= 9007199254740991 and "tts_provider_runs"."storage_sha256" ~ '^[0-9A-Fa-f]{64}$')),
	CONSTRAINT "tts_provider_runs_terminal_consistent" CHECK (("tts_provider_runs"."status" = 'STARTED' and "tts_provider_runs"."finished_at" is null) or ("tts_provider_runs"."status" <> 'STARTED' and "tts_provider_runs"."finished_at" is not null)),
	CONSTRAINT "tts_provider_runs_success_consistent" CHECK ("tts_provider_runs"."status" <> 'SUCCEEDED' or ("tts_provider_runs"."usage" is not null and "tts_provider_runs"."estimated_cost_usd" is not null and "tts_provider_runs"."error_code" is null and "tts_provider_runs"."retryable" = false and "tts_provider_runs"."storage_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "tts_voice_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"voice" text NOT NULL,
	"locale" text DEFAULT 'th-TH' NOT NULL,
	"audio_format" text DEFAULT 'audio/wav' NOT NULL,
	"generation_revision" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "async_dispatch_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload_kind" "async_dispatch_payload_kind" NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "async_dispatch_outbox_attempt_non_negative" CHECK ("async_dispatch_outbox"."attempt" >= 0),
	CONSTRAINT "async_dispatch_outbox_delivery_attempts_non_negative" CHECK ("async_dispatch_outbox"."delivery_attempts" >= 0),
	CONSTRAINT "async_dispatch_outbox_lease_pair_consistent" CHECK (("async_dispatch_outbox"."lease_owner" is null) = ("async_dispatch_outbox"."lease_expires_at" is null))
);
--> statement-breakpoint
ALTER TABLE "thai_sentence_versions" ALTER COLUMN "media_asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_job_item_id_job_items_id_fk" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_type_version_id_question_type_versions_id_fk" FOREIGN KEY ("type_version_id") REFERENCES "public"."question_type_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_topic_id_question_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."question_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_regenerated_from_candidate_id_question_production_candidates_id_fk" FOREIGN KEY ("regenerated_from_candidate_id") REFERENCES "public"."question_production_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_approved_question_version_fk" FOREIGN KEY ("approved_question_id","approved_question_version_id") REFERENCES "public"."question_versions"("question_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_production_validations" ADD CONSTRAINT "question_production_validations_candidate_id_question_production_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."question_production_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_audio_cache" ADD CONSTRAINT "tts_audio_cache_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_items" ADD CONSTRAINT "tts_items_job_id_tts_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."tts_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_items" ADD CONSTRAINT "tts_items_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_jobs" ADD CONSTRAINT "tts_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_provider_runs" ADD CONSTRAINT "tts_provider_runs_item_id_tts_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."tts_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_production_candidates_item_attempt_ordinal_unique" ON "question_production_candidates" USING btree ("job_item_id","job_attempt","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "question_production_validations_candidate_stage_unique" ON "question_production_validations" USING btree ("candidate_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_audio_cache_cache_key_unique" ON "tts_audio_cache" USING btree ("cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_audio_gc_records_storage_key_unique" ON "tts_audio_gc_records" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "tts_audio_gc_records_claim_idx" ON "tts_audio_gc_records" USING btree ("status","available_at","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_items_job_target_revision_unique" ON "tts_items" USING btree ("job_id","target_kind","target_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_provider_runs_item_attempt_unique" ON "tts_provider_runs" USING btree ("item_id","attempt");--> statement-breakpoint
CREATE INDEX "tts_provider_runs_status_started_at_idx" ON "tts_provider_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_voice_presets_name_generation_revision_unique" ON "tts_voice_presets" USING btree ("name","generation_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "async_dispatch_outbox_idempotency_key_unique" ON "async_dispatch_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "async_dispatch_outbox_execution_unique" ON "async_dispatch_outbox" USING btree ("payload_kind","job_id","attempt");--> statement-breakpoint
CREATE INDEX "async_dispatch_outbox_claim_idx" ON "async_dispatch_outbox" USING btree ("payload_kind","delivered_at","available_at","lease_expires_at");