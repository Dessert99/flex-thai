-- 문제은행·풀이·단어 연습 제거. 공용 어휘·단어장·개념과 어휘 제작 이력은 유지한다.
-- 적용 전 실행 중인 구버전 API/worker를 중지하고 백업한다. 이 파일은 자동으로 적용하지 않는다.
DROP TABLE "question_production_candidates", "question_production_validations", "vocabulary_practice_answers", "vocabulary_practice_questions", "vocabulary_practice_sessions", "question_attempts", "saved_questions", "question_tags", "question_topics", "question_type_approved_examples", "question_type_difficulty_criteria", "question_type_versions", "question_types", "question_vocabularies", "questions";
--> statement-breakpoint
ALTER TABLE "content_imports" DROP CONSTRAINT "content_imports_counts_nonnegative";--> statement-breakpoint
ALTER TABLE "content_imports" DROP CONSTRAINT "content_imports_total_count_range";--> statement-breakpoint
ALTER TABLE "content_imports" DROP CONSTRAINT "content_imports_processed_count_consistency";--> statement-breakpoint
ALTER TABLE "content_imports" DROP CONSTRAINT "content_imports_final_status_result_consistency";--> statement-breakpoint

-- 문제 신고만 정리하고 다른 콘텐츠의 신고 이력은 보존한다.
DELETE FROM content_error_report_history WHERE report_id IN (SELECT id FROM content_error_reports WHERE target_kind = 'QUESTION');
--> statement-breakpoint
DELETE FROM content_error_reports WHERE target_kind = 'QUESTION';
--> statement-breakpoint
UPDATE content_error_reports SET canonical_reference = canonical_reference - 'questionVersion' - 'questionVersionId';
--> statement-breakpoint
-- 혼합 가져오기는 어휘 항목을 유지하고 집계를 재계산한다.
DELETE FROM content_import_items WHERE kind = 'QUESTION';
--> statement-breakpoint
DELETE FROM content_imports WHERE vocabulary_count = 0;
--> statement-breakpoint
UPDATE content_imports i SET
 imported_count = (SELECT count(*) FROM content_import_items x WHERE x.import_id = i.id AND x.status = 'IMPORTED'),
 rejected_count = (SELECT count(*) FROM content_import_items x WHERE x.import_id = i.id AND x.status = 'REJECTED'),
 status = CASE WHEN i.status IS NULL THEN NULL
   WHEN EXISTS (SELECT 1 FROM content_import_items x WHERE x.import_id = i.id AND x.status = 'REJECTED') THEN 'COMPLETED_WITH_FAILURES'::content_import_status
   ELSE 'COMPLETED'::content_import_status END,
 question_count = 0;
--> statement-breakpoint
-- 문제 작업의 항목·사용량·dispatch를 정리한다. 혼합 작업의 어휘 후보는 보존한다.
DELETE FROM provider_runs WHERE job_item_id IN (SELECT id FROM job_items WHERE operation = 'QUESTION_GENERATION');
--> statement-breakpoint
DELETE FROM job_items WHERE operation = 'QUESTION_GENERATION';
--> statement-breakpoint
DELETE FROM async_dispatch_outbox WHERE job_id IN (SELECT id FROM jobs WHERE type = 'QUESTION_GENERATION' OR purpose = 'QUESTION_GENERATION');
--> statement-breakpoint
DELETE FROM job_inputs WHERE job_id IN (SELECT id FROM jobs WHERE type = 'QUESTION_GENERATION' OR purpose = 'QUESTION_GENERATION');
--> statement-breakpoint
DELETE FROM jobs WHERE type = 'QUESTION_GENERATION' OR purpose = 'QUESTION_GENERATION';
--> statement-breakpoint
UPDATE jobs SET type = 'VOCABULARY_EXTRACTION', purpose = 'VOCABULARY_EXTRACTION',
 preset_snapshot = jsonb_set(jsonb_set(preset_snapshot, '{purpose}', '"VOCABULARY_EXTRACTION"'), '{parameters}',
   jsonb_build_object('suspectedDuplicateMaxCodePointDistance', coalesce(preset_snapshot #> '{parameters,suspectedDuplicateMaxCodePointDistance}', '0'::jsonb)))
WHERE type = 'VOCABULARY_THEN_QUESTION_GENERATION' OR purpose = 'VOCABULARY_THEN_QUESTION_GENERATION';
--> statement-breakpoint
UPDATE content_production_presets SET purpose = 'VOCABULARY_EXTRACTION',
 parameters = jsonb_build_object('suspectedDuplicateMaxCodePointDistance', coalesce(parameters -> 'suspectedDuplicateMaxCodePointDistance', '0'::jsonb))
WHERE purpose = 'VOCABULARY_THEN_QUESTION_GENERATION';
--> statement-breakpoint
DELETE FROM content_production_presets WHERE purpose = 'QUESTION_GENERATION';
--> statement-breakpoint
ALTER TABLE "content_import_items" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."content_import_item_kind";--> statement-breakpoint
CREATE TYPE "public"."content_import_item_kind" AS ENUM('VOCABULARY');--> statement-breakpoint
ALTER TABLE "content_import_items" ALTER COLUMN "kind" SET DATA TYPE "public"."content_import_item_kind" USING "kind"::"public"."content_import_item_kind";--> statement-breakpoint
ALTER TABLE "content_error_reports" ALTER COLUMN "target_kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."content_error_report_target_kind";--> statement-breakpoint
CREATE TYPE "public"."content_error_report_target_kind" AS ENUM('VOCABULARY', 'SENTENCE', 'CONCEPT');--> statement-breakpoint
ALTER TABLE "content_error_reports" ALTER COLUMN "target_kind" SET DATA TYPE "public"."content_error_report_target_kind" USING "target_kind"::"public"."content_error_report_target_kind";--> statement-breakpoint
ALTER TABLE "job_items" ALTER COLUMN "operation" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."content_production_operation";--> statement-breakpoint
CREATE TYPE "public"."content_production_operation" AS ENUM('VOCABULARY_EXTRACTION');--> statement-breakpoint
ALTER TABLE "job_items" ALTER COLUMN "operation" SET DATA TYPE "public"."content_production_operation" USING "operation"::"public"."content_production_operation";--> statement-breakpoint
ALTER TABLE "content_production_presets" ALTER COLUMN "purpose" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "purpose" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."content_production_purpose";--> statement-breakpoint
CREATE TYPE "public"."content_production_purpose" AS ENUM('VOCABULARY_EXTRACTION');--> statement-breakpoint
ALTER TABLE "content_production_presets" ALTER COLUMN "purpose" SET DATA TYPE "public"."content_production_purpose" USING "purpose"::"public"."content_production_purpose";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "purpose" SET DATA TYPE "public"."content_production_purpose" USING "purpose"::"public"."content_production_purpose";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."job_type";--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('VOCAB_IMPORT', 'VOCABULARY_EXTRACTION');--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "type" SET DATA TYPE "public"."job_type" USING "type"::"public"."job_type";--> statement-breakpoint
ALTER TABLE "content_imports" DROP COLUMN "question_count";--> statement-breakpoint
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_counts_nonnegative" CHECK ("content_imports"."vocabulary_count" >= 0 and "content_imports"."imported_count" >= 0 and "content_imports"."rejected_count" >= 0);--> statement-breakpoint
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_total_count_range" CHECK ("content_imports"."vocabulary_count" between 1 and 100);--> statement-breakpoint
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_processed_count_consistency" CHECK ("content_imports"."imported_count" + "content_imports"."rejected_count" <= "content_imports"."vocabulary_count");--> statement-breakpoint
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_final_status_result_consistency" CHECK ("content_imports"."status" is null or ("content_imports"."status" = 'COMPLETED' and "content_imports"."rejected_count" = 0 and "content_imports"."imported_count" + "content_imports"."rejected_count" = "content_imports"."vocabulary_count") or ("content_imports"."status" = 'COMPLETED_WITH_FAILURES' and "content_imports"."rejected_count" > 0 and "content_imports"."imported_count" + "content_imports"."rejected_count" = "content_imports"."vocabulary_count"));--> statement-breakpoint
DROP TYPE "public"."question_candidate_group";--> statement-breakpoint
DROP TYPE "public"."question_candidate_payload_state";--> statement-breakpoint
DROP TYPE "public"."question_candidate_review_status";--> statement-breakpoint
DROP TYPE "public"."question_production_validation_status";--> statement-breakpoint
DROP TYPE "public"."question_validation_stage";--> statement-breakpoint
DROP TYPE "public"."vocabulary_practice_mode";--> statement-breakpoint
DROP TYPE "public"."vocabulary_practice_order";--> statement-breakpoint
DROP TYPE "public"."vocabulary_practice_source_type";--> statement-breakpoint
DROP TYPE "public"."vocabulary_practice_status";--> statement-breakpoint
DROP TYPE "public"."question_block_kind";--> statement-breakpoint
DROP TYPE "public"."question_major_category";--> statement-breakpoint
DROP TYPE "public"."question_skill";--> statement-breakpoint
DROP TYPE "public"."question_status";--> statement-breakpoint
DROP TYPE "public"."question_taxonomy_status";--> statement-breakpoint
DROP TYPE "public"."question_template";--> statement-breakpoint
DROP TYPE "public"."question_type_version_status";--> statement-breakpoint
DROP TYPE "public"."question_validation_status";--> statement-breakpoint
DROP TYPE "public"."question_version_status";--> statement-breakpoint
DROP TYPE "public"."question_vocabulary_role";