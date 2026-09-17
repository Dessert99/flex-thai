-- 개발 데이터는 초기화 후 새 시드로 구성한다. 기존 데이터가 있는 DB에는 적용하지 않는다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM questions)
    OR EXISTS (SELECT 1 FROM question_attempts)
    OR EXISTS (SELECT 1 FROM question_production_candidates)
    OR EXISTS (SELECT 1 FROM content_error_reports) THEN
    RAISE EXCEPTION 'QUESTION_BANK_MVP_REQUIRES_EMPTY_DATA: reset the local development database before migration';
  END IF;
END $$;
--> statement-breakpoint
CREATE TYPE "public"."question_vocabulary_role" AS ENUM('TARGET', 'CONTEXT');
--> statement-breakpoint
CREATE TABLE "question_vocabularies" (
	"question_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"meaning_id" uuid,
	"role" "question_vocabulary_role" NOT NULL,
	"occurrence_count" integer NOT NULL,
	CONSTRAINT "question_vocabularies_question_id_vocabulary_id_pk" PRIMARY KEY("question_id","vocabulary_id"),
	CONSTRAINT "question_vocabularies_occurrence_positive" CHECK ("question_vocabularies"."occurrence_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "question_production_candidates" DROP CONSTRAINT "question_production_candidates_payload_representation_consistency";
--> statement-breakpoint
ALTER TABLE "question_production_candidates" DROP CONSTRAINT "question_production_candidates_review_approval_consistency";
--> statement-breakpoint
ALTER TABLE "question_production_candidates" DROP CONSTRAINT "question_production_candidates_approved_question_version_fk";
--> statement-breakpoint
ALTER TABLE "question_attempts" DROP CONSTRAINT "question_attempts_question_version_fk";
--> statement-breakpoint
ALTER TABLE "question_attempts" DROP CONSTRAINT "question_attempts_selected_option_fk";
--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT "questions_current_published_version_fk";
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD COLUMN "approved_question_version" integer;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN "question_version" integer;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD COLUMN "question_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "type_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "topic_id" uuid;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "tag_ids" uuid[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "passage" text;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "prompt" text;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "options" jsonb;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "correct_option_id" uuid;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "explanation" text;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "difficulty" integer;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "vocabularies" ADD COLUMN "importance_weight" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "question_version" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "question_attempts" ALTER COLUMN "question_snapshot" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "type_version_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "topic_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "prompt" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "options" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "correct_option_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "explanation" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "difficulty" SET NOT NULL;
--> statement-breakpoint
DROP TABLE "question_block_sentences" CASCADE;
--> statement-breakpoint
DROP TABLE "question_blocks" CASCADE;
--> statement-breakpoint
DROP TABLE "question_options" CASCADE;
--> statement-breakpoint
DROP TABLE "question_version_tags" CASCADE;
--> statement-breakpoint
DROP TABLE "question_versions" CASCADE;
--> statement-breakpoint
ALTER TABLE "question_vocabularies" ADD CONSTRAINT "question_vocabularies_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_vocabularies" ADD CONSTRAINT "question_vocabularies_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_vocabularies" ADD CONSTRAINT "question_vocabularies_meaning_owner_fk" FOREIGN KEY ("meaning_id","vocabulary_id") REFERENCES "public"."vocabulary_meanings"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "question_vocabularies_vocabulary_idx" ON "question_vocabularies" USING btree ("vocabulary_id");
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_approved_question_id_questions_id_fk" FOREIGN KEY ("approved_question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_type_version_id_question_type_versions_id_fk" FOREIGN KEY ("type_version_id") REFERENCES "public"."question_type_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_question_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."question_topics"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_production_candidates" DROP COLUMN "approved_question_version_id";
--> statement-breakpoint
ALTER TABLE "question_attempts" DROP COLUMN "question_version_id";
--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "current_published_version_id";
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_payload_representation_consistency" CHECK (("question_production_candidates"."payload_state" = 'CANONICAL' and "question_production_candidates"."topic_id" is not null and "question_production_candidates"."difficulty" is not null and "question_production_candidates"."payload" is not null) or ("question_production_candidates"."payload_state" = 'REDACTED_INVALID' and "question_production_candidates"."topic_id" is null and "question_production_candidates"."difficulty" is null and "question_production_candidates"."payload" is null and "question_production_candidates"."result_group" = 'FAILED' and "question_production_candidates"."review_status" <> 'APPROVED' and "question_production_candidates"."approved_question_id" is null and "question_production_candidates"."approved_question_version" is null));
--> statement-breakpoint
ALTER TABLE "question_production_candidates" ADD CONSTRAINT "question_production_candidates_review_approval_consistency" CHECK (("question_production_candidates"."review_status" = 'APPROVED' and "question_production_candidates"."approved_question_id" is not null and "question_production_candidates"."approved_question_version" is not null) or ("question_production_candidates"."review_status" <> 'APPROVED' and "question_production_candidates"."approved_question_id" is null and "question_production_candidates"."approved_question_version" is null));
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_version_positive" CHECK ("question_attempts"."question_version" > 0);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_version_positive" CHECK ("questions"."version" > 0);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_difficulty_range" CHECK ("questions"."difficulty" between 1 and 5);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_options_count" CHECK (jsonb_typeof("questions"."options") = 'array' and jsonb_array_length("questions"."options") between 2 and 10);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_correct_option_exists" CHECK ("questions"."options" @> jsonb_build_array(jsonb_build_object('id', "questions"."correct_option_id"::text)));
--> statement-breakpoint
ALTER TABLE "vocabularies" ADD CONSTRAINT "vocabularies_importance_weight_range" CHECK ("vocabularies"."importance_weight" between 1 and 10);
