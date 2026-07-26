ALTER TYPE "public"."token_occurrence_role" ADD VALUE 'INSTRUCTION';--> statement-breakpoint
ALTER TYPE "public"."question_template" ADD VALUE 'INLINE_SPAN_CHOICE';--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD COLUMN "meaning_id" uuid;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD COLUMN "pronunciation_id" uuid;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD COLUMN "context_meaning_ko" text;--> statement-breakpoint
UPDATE "expression_occurrences" AS eo
SET
	"meaning_id" = (
		SELECT vm."id"
		FROM "vocabulary_meanings" AS vm
		WHERE vm."vocabulary_id" = eo."vocabulary_id"
		ORDER BY vm."created_at" ASC, vm."id" ASC
		LIMIT 1
	),
	"context_meaning_ko" = (
		SELECT vm."meaning_ko"
		FROM "vocabulary_meanings" AS vm
		WHERE vm."vocabulary_id" = eo."vocabulary_id"
		ORDER BY vm."created_at" ASC, vm."id" ASC
		LIMIT 1
	),
	"pronunciation_id" = (
		SELECT vp."id"
		FROM "vocabulary_pronunciations" AS vp
		WHERE vp."vocabulary_id" = eo."vocabulary_id"
		ORDER BY vp."created_at" ASC, vp."id" ASC
		LIMIT 1
	);--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "expression_occurrences"
		WHERE "meaning_id" IS NULL
			OR "pronunciation_id" IS NULL
			OR "context_meaning_ko" IS NULL
	) THEN
		RAISE EXCEPTION 'expression occurrence feedback backfill has missing rows';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER COLUMN "meaning_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER COLUMN "pronunciation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER COLUMN "context_meaning_ko" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_options" ALTER COLUMN "sentence_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "span_sentence_version_id" uuid;--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "span_start_token_index" integer;--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "span_end_token_index" integer;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD CONSTRAINT "expression_occurrences_meaning_vocabulary_fk" FOREIGN KEY ("meaning_id","vocabulary_id") REFERENCES "public"."vocabulary_meanings"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD CONSTRAINT "expression_occurrences_pronunciation_vocabulary_fk" FOREIGN KEY ("pronunciation_id","vocabulary_id") REFERENCES "public"."vocabulary_pronunciations"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_span_sentence_version_id_thai_sentence_versions_id_fk" FOREIGN KEY ("span_sentence_version_id") REFERENCES "public"."thai_sentence_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_sentence_or_span" CHECK (("question_options"."sentence_version_id" is not null and "question_options"."span_sentence_version_id" is null and "question_options"."span_start_token_index" is null and "question_options"."span_end_token_index" is null)
	or ("question_options"."sentence_version_id" is null and "question_options"."span_sentence_version_id" is not null and "question_options"."span_start_token_index" is not null and "question_options"."span_end_token_index" is not null));--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_span_range" CHECK ("question_options"."span_start_token_index" is null or ("question_options"."span_start_token_index" >= 0 and "question_options"."span_end_token_index" > "question_options"."span_start_token_index"));
