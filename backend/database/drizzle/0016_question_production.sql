CREATE TYPE "public"."async_dispatch_payload_kind" AS ENUM('CONTENT_PRODUCTION');
--> statement-breakpoint
CREATE TYPE "public"."question_candidate_group" AS ENUM('NORMAL', 'NEEDS_ATTENTION', 'FAILED');
--> statement-breakpoint
CREATE TYPE "public"."question_candidate_payload_state" AS ENUM('CANONICAL', 'REDACTED_INVALID');
--> statement-breakpoint
CREATE TYPE "public"."question_candidate_review_status" AS ENUM('PENDING', 'APPROVED', 'DISCARDED');
--> statement-breakpoint
CREATE TYPE "public"."question_production_validation_status" AS ENUM('PASSED', 'FAILED', 'SKIPPED');
--> statement-breakpoint
CREATE TYPE "public"."question_validation_stage" AS ENUM('SCHEMA', 'DECISION_RULE', 'SIMILARITY', 'AI_CROSS_VALIDATION');
--> statement-breakpoint
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
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_job_item_id_job_items_id_fk" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_type_version_id_question_type_versions_id_fk" FOREIGN KEY ("type_version_id") REFERENCES "public"."question_type_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_topic_id_question_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."question_topics"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_regenerated_from_candidate_id_question_production_candidates_id_fk" FOREIGN KEY ("regenerated_from_candidate_id") REFERENCES "public"."question_production_candidates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_approved_question_version_fk" FOREIGN KEY ("approved_question_id","approved_question_version_id") REFERENCES "public"."question_versions"("question_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_production_validations" ADD CONSTRAINT "question_production_validations_candidate_id_question_production_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."question_production_candidates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "question_production_candidates_item_attempt_ordinal_unique" ON "question_production_candidates" USING btree ("job_item_id","job_attempt","ordinal");
--> statement-breakpoint
CREATE UNIQUE INDEX "question_production_validations_candidate_stage_unique" ON "question_production_validations" USING btree ("candidate_id","stage");
--> statement-breakpoint
CREATE UNIQUE INDEX "async_dispatch_outbox_idempotency_key_unique" ON "async_dispatch_outbox" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "async_dispatch_outbox_execution_unique" ON "async_dispatch_outbox" USING btree ("payload_kind","job_id","attempt");
--> statement-breakpoint
CREATE INDEX "async_dispatch_outbox_claim_idx" ON "async_dispatch_outbox" USING btree ("payload_kind","delivered_at","available_at","lease_expires_at");
