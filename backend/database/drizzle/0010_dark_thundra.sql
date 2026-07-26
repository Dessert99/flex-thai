CREATE TYPE "public"."vocabulary_practice_mode" AS ENUM('THAI_TO_MEANING', 'MEANING_TO_THAI', 'AUDIO_TO_THAI', 'AUDIO_TO_MEANING');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_practice_order" AS ENUM('RANDOM', 'SOURCE');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_practice_source_type" AS ENUM('SEARCH_SELECTION', 'WORDBOOK');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_practice_status" AS ENUM('ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "vocabulary_practice_answers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_answer_id" uuid NOT NULL,
	"selected_option_id" uuid NOT NULL,
	"selected_label_snapshot" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_practice_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"meaning_id" uuid NOT NULL,
	"pronunciation_id" uuid,
	"media_asset_id" uuid,
	"mode" "vocabulary_practice_mode" NOT NULL,
	"prompt_text" text,
	"audio_storage_key" text,
	"thai_snapshot" text NOT NULL,
	"meaning_ko_snapshot" text NOT NULL,
	"pronunciation_ko_snapshot" text,
	"tone_marks_snapshot" text,
	"options" jsonb NOT NULL,
	"correct_option_id" uuid NOT NULL,
	"card_snapshot" jsonb NOT NULL,
	CONSTRAINT "vocabulary_practice_questions_position_positive" CHECK ("vocabulary_practice_questions"."position" > 0),
	CONSTRAINT "vocabulary_practice_questions_audio_fields_match" CHECK (("vocabulary_practice_questions"."mode" in ('AUDIO_TO_THAI', 'AUDIO_TO_MEANING') and "vocabulary_practice_questions"."pronunciation_id" is not null and "vocabulary_practice_questions"."media_asset_id" is not null and "vocabulary_practice_questions"."audio_storage_key" is not null and "vocabulary_practice_questions"."prompt_text" is null) or ("vocabulary_practice_questions"."mode" not in ('AUDIO_TO_THAI', 'AUDIO_TO_MEANING') and "vocabulary_practice_questions"."pronunciation_id" is null and "vocabulary_practice_questions"."media_asset_id" is null and "vocabulary_practice_questions"."audio_storage_key" is null and "vocabulary_practice_questions"."prompt_text" is not null))
);
--> statement-breakpoint
CREATE TABLE "vocabulary_practice_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" "vocabulary_practice_source_type" NOT NULL,
	"source_wordbook_id" uuid,
	"source_label" text NOT NULL,
	"modes" "vocabulary_practice_mode"[] NOT NULL,
	"requested_question_count" integer,
	"question_order" "vocabulary_practice_order" NOT NULL,
	"status" "vocabulary_practice_status" DEFAULT 'ACTIVE' NOT NULL,
	"question_count" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "vocabulary_practice_sessions_question_count_range" CHECK ("vocabulary_practice_sessions"."question_count" between 1 and 100),
	CONSTRAINT "vocabulary_practice_sessions_requested_count_valid" CHECK ("vocabulary_practice_sessions"."requested_question_count" is null or "vocabulary_practice_sessions"."requested_question_count" in (10, 20)),
	CONSTRAINT "vocabulary_practice_sessions_modes_nonempty" CHECK (cardinality("vocabulary_practice_sessions"."modes") between 1 and 4),
	CONSTRAINT "vocabulary_practice_sessions_status_completed_at_match" CHECK (("vocabulary_practice_sessions"."status" = 'ACTIVE' and "vocabulary_practice_sessions"."completed_at" is null) or ("vocabulary_practice_sessions"."status" = 'COMPLETED' and "vocabulary_practice_sessions"."completed_at" is not null)),
	CONSTRAINT "vocabulary_practice_sessions_source_match" CHECK (("vocabulary_practice_sessions"."source_type" = 'SEARCH_SELECTION' and "vocabulary_practice_sessions"."source_wordbook_id" is null) or "vocabulary_practice_sessions"."source_type" = 'WORDBOOK')
);
--> statement-breakpoint
ALTER TABLE "vocabulary_practice_answers" ADD CONSTRAINT "vocabulary_practice_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_answers" ADD CONSTRAINT "vocabulary_practice_answers_question_session_fk" FOREIGN KEY ("session_id","question_id") REFERENCES "public"."vocabulary_practice_questions"("session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_answers" ADD CONSTRAINT "vocabulary_practice_answers_session_user_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."vocabulary_practice_sessions"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" ADD CONSTRAINT "vocabulary_practice_questions_session_id_vocabulary_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."vocabulary_practice_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" ADD CONSTRAINT "vocabulary_practice_questions_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" ADD CONSTRAINT "vocabulary_practice_questions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" ADD CONSTRAINT "vocabulary_practice_questions_meaning_vocabulary_fk" FOREIGN KEY ("meaning_id","vocabulary_id") REFERENCES "public"."vocabulary_meanings"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" ADD CONSTRAINT "vocabulary_practice_questions_pronunciation_vocabulary_fk" FOREIGN KEY ("pronunciation_id","vocabulary_id") REFERENCES "public"."vocabulary_pronunciations"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_sessions" ADD CONSTRAINT "vocabulary_practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_practice_sessions" ADD CONSTRAINT "vocabulary_practice_sessions_source_wordbook_id_wordbooks_id_fk" FOREIGN KEY ("source_wordbook_id") REFERENCES "public"."wordbooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_practice_answers_session_question_unique" ON "vocabulary_practice_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_practice_answers_user_client_unique" ON "vocabulary_practice_answers" USING btree ("user_id","client_answer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_practice_questions_session_position_unique" ON "vocabulary_practice_questions" USING btree ("session_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_practice_questions_session_id_unique" ON "vocabulary_practice_questions" USING btree ("session_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_practice_sessions_id_user_unique" ON "vocabulary_practice_sessions" USING btree ("id","user_id");