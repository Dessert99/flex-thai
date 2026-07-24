CREATE TYPE "public"."question_block_kind" AS ENUM('INSTRUCTION', 'PASSAGE', 'DIALOGUE', 'QUESTION', 'EXPLANATION');--> statement-breakpoint
CREATE TYPE "public"."question_display_mode" AS ENUM('TEXT', 'AUDIO', 'TEXT_AND_AUDIO', 'AUDIO_THEN_REVEAL');--> statement-breakpoint
CREATE TYPE "public"."question_skill" AS ENUM('READING', 'LISTENING');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('DRAFT', 'PUBLISHED', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."question_template" AS ENUM('STANDARD_CHOICE', 'PASSAGE_CHOICE', 'DIALOGUE_CHOICE');--> statement-breakpoint
CREATE TYPE "public"."question_validation_status" AS ENUM('PENDING', 'PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."question_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'RETIRED', 'INVALIDATED');--> statement-breakpoint
CREATE TABLE "question_block_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"sentence_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"speaker" text,
	CONSTRAINT "question_block_sentences_position_nonnegative" CHECK ("question_block_sentences"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "question_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"kind" "question_block_kind" NOT NULL,
	"display_mode" "question_display_mode" NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "question_blocks_position_nonnegative" CHECK ("question_blocks"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"sentence_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	CONSTRAINT "question_options_question_version_id_id_unique" UNIQUE("question_version_id","id"),
	CONSTRAINT "question_options_position_nonnegative" CHECK ("question_options"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "question_type_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_type_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"template" "question_template" NOT NULL,
	"option_count" integer NOT NULL,
	"decision_rules" jsonb NOT NULL,
	CONSTRAINT "question_type_versions_version_positive" CHECK ("question_type_versions"."version" > 0),
	CONSTRAINT "question_type_versions_option_count_positive" CHECK ("question_type_versions"."option_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "question_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"skill" "question_skill" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"type_version_id" uuid NOT NULL,
	"difficulty" integer NOT NULL,
	"status" "question_version_status" DEFAULT 'DRAFT' NOT NULL,
	"validation_status" "question_validation_status" DEFAULT 'PENDING' NOT NULL,
	"validation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_versions_question_id_id_unique" UNIQUE("question_id","id"),
	CONSTRAINT "question_versions_version_positive" CHECK ("question_versions"."version" > 0),
	CONSTRAINT "question_versions_difficulty_range" CHECK ("question_versions"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "question_status" DEFAULT 'DRAFT' NOT NULL,
	"current_published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "target_type" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "question_block_sentences" ADD CONSTRAINT "question_block_sentences_block_id_question_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."question_blocks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_block_sentences" ADD CONSTRAINT "question_block_sentences_sentence_version_id_thai_sentence_versions_id_fk" FOREIGN KEY ("sentence_version_id") REFERENCES "public"."thai_sentence_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_blocks" ADD CONSTRAINT "question_blocks_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_sentence_version_id_thai_sentence_versions_id_fk" FOREIGN KEY ("sentence_version_id") REFERENCES "public"."thai_sentence_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_type_versions" ADD CONSTRAINT "question_type_versions_question_type_id_question_types_id_fk" FOREIGN KEY ("question_type_id") REFERENCES "public"."question_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_type_version_id_question_type_versions_id_fk" FOREIGN KEY ("type_version_id") REFERENCES "public"."question_type_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_current_published_version_fk" FOREIGN KEY ("id","current_published_version_id") REFERENCES "public"."question_versions"("question_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_block_sentences_block_position_unique" ON "question_block_sentences" USING btree ("block_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "question_blocks_version_position_unique" ON "question_blocks" USING btree ("question_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_version_position_unique" ON "question_options" USING btree ("question_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "question_options_one_correct_per_version" ON "question_options" USING btree ("question_version_id") WHERE "question_options"."is_correct" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "question_type_versions_type_version_unique" ON "question_type_versions" USING btree ("question_type_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "question_types_slug_unique" ON "question_types" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "question_versions_question_version_unique" ON "question_versions" USING btree ("question_id","version");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;