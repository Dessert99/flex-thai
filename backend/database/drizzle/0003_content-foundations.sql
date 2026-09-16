CREATE TYPE "public"."vocabulary_kind" AS ENUM('WORD', 'EXPRESSION');
--> statement-breakpoint
CREATE TYPE "public"."vocabulary_status" AS ENUM('DRAFT', 'PUBLISHED', 'HIDDEN');
--> statement-breakpoint
CREATE TYPE "public"."token_occurrence_role" AS ENUM('TARGET', 'REQUIRED', 'SUPPORTING');
--> statement-breakpoint
CREATE TABLE "vocabularies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thai" text NOT NULL,
	"normalized_thai" text NOT NULL,
	"kind" "vocabulary_kind" NOT NULL,
	"status" "vocabulary_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabularies_id_kind_unique" UNIQUE("id","kind")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_meaning_pronunciations" (
	"vocabulary_id" uuid NOT NULL,
	"meaning_id" uuid NOT NULL,
	"pronunciation_id" uuid NOT NULL,
	CONSTRAINT "vocabulary_meaning_pronunciations_pk" PRIMARY KEY("meaning_id","pronunciation_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_meanings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"meaning_ko" text NOT NULL,
	"part_of_speech" text NOT NULL,
	"difficulty" integer,
	"context_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_meanings_id_vocabulary_unique" UNIQUE("id","vocabulary_id"),
	CONSTRAINT "vocabulary_meanings_difficulty_range" CHECK ("vocabulary_meanings"."difficulty" is null or "vocabulary_meanings"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "vocabulary_pronunciations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"pronunciation_ko" text NOT NULL,
	"tone_marks" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_pronunciations_id_vocabulary_unique" UNIQUE("id","vocabulary_id")
);
--> statement-breakpoint
CREATE TABLE "expression_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sentence_version_id" uuid NOT NULL,
	"start_token_index" integer NOT NULL,
	"end_token_index" integer NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"vocabulary_kind" "vocabulary_kind" NOT NULL,
	"representative" boolean DEFAULT false NOT NULL,
	CONSTRAINT "expression_occurrences_vocabulary_kind_expression" CHECK ("expression_occurrences"."vocabulary_kind" = 'EXPRESSION'),
	CONSTRAINT "expression_occurrences_token_range" CHECK ("expression_occurrences"."start_token_index" >= 0 and "expression_occurrences"."end_token_index" - "expression_occurrences"."start_token_index" >= 2)
);
--> statement-breakpoint
CREATE TABLE "thai_sentence_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sentence_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"original_text" text NOT NULL,
	"translation_ko" text NOT NULL,
	"pronunciation_ko" text NOT NULL,
	"tone_marks" text NOT NULL,
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thai_sentence_versions_version_positive" CHECK ("thai_sentence_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "thai_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sentence_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"surface" text NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"meaning_id" uuid NOT NULL,
	"pronunciation_id" uuid NOT NULL,
	"context_meaning_ko" text NOT NULL,
	"role" "token_occurrence_role" NOT NULL,
	CONSTRAINT "token_occurrences_position_nonnegative" CHECK ("token_occurrences"."position" >= 0),
	CONSTRAINT "token_occurrences_offset_range" CHECK ("token_occurrences"."start_offset" >= 0 and "token_occurrences"."end_offset" > "token_occurrences"."start_offset")
);
--> statement-breakpoint
ALTER TABLE "vocabulary_meaning_pronunciations" ADD CONSTRAINT "vocabulary_meaning_pronunciations_meaning_fk" FOREIGN KEY ("meaning_id","vocabulary_id") REFERENCES "public"."vocabulary_meanings"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_meaning_pronunciations" ADD CONSTRAINT "vocabulary_meaning_pronunciations_pronunciation_fk" FOREIGN KEY ("pronunciation_id","vocabulary_id") REFERENCES "public"."vocabulary_pronunciations"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_meanings" ADD CONSTRAINT "vocabulary_meanings_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_pronunciations" ADD CONSTRAINT "vocabulary_pronunciations_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD CONSTRAINT "expression_occurrences_sentence_version_id_thai_sentence_versions_id_fk" FOREIGN KEY ("sentence_version_id") REFERENCES "public"."thai_sentence_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD CONSTRAINT "expression_occurrences_vocabulary_kind_fk" FOREIGN KEY ("vocabulary_id","vocabulary_kind") REFERENCES "public"."vocabularies"("id","kind") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "thai_sentence_versions" ADD CONSTRAINT "thai_sentence_versions_sentence_id_thai_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."thai_sentences"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "token_occurrences" ADD CONSTRAINT "token_occurrences_sentence_version_id_thai_sentence_versions_id_fk" FOREIGN KEY ("sentence_version_id") REFERENCES "public"."thai_sentence_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "token_occurrences" ADD CONSTRAINT "token_occurrences_vocabulary_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "token_occurrences" ADD CONSTRAINT "token_occurrences_meaning_vocabulary_fk" FOREIGN KEY ("meaning_id","vocabulary_id") REFERENCES "public"."vocabulary_meanings"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "token_occurrences" ADD CONSTRAINT "token_occurrences_pronunciation_vocabulary_fk" FOREIGN KEY ("pronunciation_id","vocabulary_id") REFERENCES "public"."vocabulary_pronunciations"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "vocabularies_normalized_thai_unique" ON "vocabularies" USING btree ("normalized_thai");
--> statement-breakpoint
CREATE INDEX "expression_occurrences_sentence_idx" ON "expression_occurrences" USING btree ("sentence_version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "thai_sentence_versions_sentence_version_unique" ON "thai_sentence_versions" USING btree ("sentence_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "token_occurrences_sentence_position_unique" ON "token_occurrences" USING btree ("sentence_version_id","position");
