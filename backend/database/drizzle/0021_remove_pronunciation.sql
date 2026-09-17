ALTER TABLE "vocabulary_practice_questions" DROP CONSTRAINT "vocabulary_practice_questions_pronunciation_matches_meaning";--> statement-breakpoint
ALTER TABLE "expression_occurrences" DROP CONSTRAINT "expression_occurrences_pronunciation_matches_meaning";--> statement-breakpoint
ALTER TABLE "token_occurrences" DROP CONSTRAINT "token_occurrences_pronunciation_matches_meaning";--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" DROP CONSTRAINT "vocabulary_practice_questions_pronunciation_vocabulary_fk";
--> statement-breakpoint
ALTER TABLE "expression_occurrences" DROP CONSTRAINT "expression_occurrences_pronunciation_vocabulary_fk";
--> statement-breakpoint
ALTER TABLE "token_occurrences" DROP CONSTRAINT "token_occurrences_pronunciation_vocabulary_fk";
--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" DROP COLUMN "pronunciation_id";--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" DROP COLUMN "pronunciation_ko_snapshot";--> statement-breakpoint
ALTER TABLE "vocabulary_practice_questions" DROP COLUMN "tone_marks_snapshot";--> statement-breakpoint
ALTER TABLE "expression_occurrences" DROP COLUMN "pronunciation_id";--> statement-breakpoint
ALTER TABLE "thai_sentence_versions" DROP COLUMN "pronunciation_ko";--> statement-breakpoint
ALTER TABLE "thai_sentence_versions" DROP COLUMN "tone_marks";--> statement-breakpoint
ALTER TABLE "token_occurrences" DROP COLUMN "pronunciation_id";--> statement-breakpoint
ALTER TABLE "vocabulary_meanings" DROP COLUMN "pronunciation_ko";--> statement-breakpoint
ALTER TABLE "vocabulary_meanings" DROP COLUMN "tone_marks";
--> statement-breakpoint
-- Remove retired fields from persisted content snapshots as well as SQL columns.
CREATE FUNCTION pg_temp.remove_pronunciation_fields(value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result jsonb;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(key, pg_temp.remove_pronunciation_fields(item)), '{}'::jsonb)
      INTO result FROM jsonb_each(value) AS entry(key, item)
      WHERE key NOT IN ('pronunciationKo', 'toneMarks', 'pronunciationId',
        'pronunciation', 'pronunciations', 'meaningPronunciations',
        'pronunciationRef', 'pronunciationCount');
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT coalesce(jsonb_agg(pg_temp.remove_pronunciation_fields(item) ORDER BY ordinal), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS entry(item, ordinal);
    RETURN result;
  END IF;
  RETURN value;
END;
$$;
--> statement-breakpoint
UPDATE vocabulary_practice_questions SET card_snapshot = pg_temp.remove_pronunciation_fields(card_snapshot);
--> statement-breakpoint
UPDATE question_type_approved_examples SET payload = pg_temp.remove_pronunciation_fields(payload);
--> statement-breakpoint
UPDATE question_production_candidates SET payload = pg_temp.remove_pronunciation_fields(payload);
--> statement-breakpoint
UPDATE question_attempts SET question_snapshot = pg_temp.remove_pronunciation_fields(question_snapshot);
--> statement-breakpoint
UPDATE vocabulary_merge_history SET
  source_snapshot = pg_temp.remove_pronunciation_fields(source_snapshot),
  representative_snapshot = pg_temp.remove_pronunciation_fields(representative_snapshot),
  moved_counts = pg_temp.remove_pronunciation_fields(moved_counts);
--> statement-breakpoint
UPDATE content_error_reports SET snapshot = snapshot || '{"secondaryText": null}'::jsonb
  WHERE target_kind IN ('VOCABULARY', 'SENTENCE') OR canonical_reference->>'sentenceVersionId' IS NOT NULL;
--> statement-breakpoint
UPDATE provider_runs SET result = pg_temp.remove_pronunciation_fields(result);
--> statement-breakpoint
UPDATE job_items SET result = pg_temp.remove_pronunciation_fields(result);
--> statement-breakpoint
UPDATE audit_logs SET summary = pg_temp.remove_pronunciation_fields(summary);
--> statement-breakpoint
DROP FUNCTION pg_temp.remove_pronunciation_fields(jsonb);

--> statement-breakpoint
UPDATE content_error_reports SET category = 'OTHER' WHERE category = 'PRONUNCIATION_TONE';
--> statement-breakpoint
ALTER TABLE "content_error_reports" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."content_error_report_category";--> statement-breakpoint
CREATE TYPE "public"."content_error_report_category" AS ENUM('MEANING_TRANSLATION', 'ANSWER_EXPLANATION', 'TOKENIZATION', 'OTHER');--> statement-breakpoint
ALTER TABLE "content_error_reports" ALTER COLUMN "category" SET DATA TYPE "public"."content_error_report_category" USING "category"::"public"."content_error_report_category";
--> statement-breakpoint
ALTER TYPE "public"."concept_category" RENAME VALUE 'THAI_SCRIPT_PRONUNCIATION' TO 'THAI_SCRIPT';
