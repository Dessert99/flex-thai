-- 콘텐츠 가져오기·제작·개념을 제거하고 어휘·단어장·단어 추출·운영 사용량 이력은 유지한다.
ALTER TABLE "provider_runs" DROP CONSTRAINT "provider_runs_job_item_id_job_items_id_fk";
--> statement-breakpoint
DROP TABLE "vocabulary_production_candidates", "vocabulary_production_validations", "async_dispatch_outbox", "concept_block_examples", "concept_blocks", "concept_versions", "concepts", "content_import_items", "content_imports", "content_production_presets", "job_inputs", "job_items", "jobs";
--> statement-breakpoint
DELETE FROM content_error_report_history WHERE report_id IN (SELECT id FROM content_error_reports WHERE target_kind = 'CONCEPT');
--> statement-breakpoint
DELETE FROM content_error_reports WHERE target_kind = 'CONCEPT';
--> statement-breakpoint
ALTER TABLE "content_error_reports" ALTER COLUMN "target_kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."content_error_report_target_kind";--> statement-breakpoint
CREATE TYPE "public"."content_error_report_target_kind" AS ENUM('VOCABULARY', 'SENTENCE');--> statement-breakpoint
ALTER TABLE "content_error_reports" ALTER COLUMN "target_kind" SET DATA TYPE "public"."content_error_report_target_kind" USING "target_kind"::"public"."content_error_report_target_kind";--> statement-breakpoint
DROP INDEX "provider_runs_item_attempt_operation_sequence_unique";--> statement-breakpoint
ALTER TABLE "provider_runs" DROP COLUMN "job_item_id";--> statement-breakpoint
DROP TYPE "public"."vocabulary_candidate_classification";--> statement-breakpoint
DROP TYPE "public"."vocabulary_candidate_group";--> statement-breakpoint
DROP TYPE "public"."vocabulary_candidate_resolution_kind";--> statement-breakpoint
DROP TYPE "public"."vocabulary_candidate_review_status";--> statement-breakpoint
DROP TYPE "public"."vocabulary_validation_stage";--> statement-breakpoint
DROP TYPE "public"."vocabulary_validation_status";--> statement-breakpoint
DROP TYPE "public"."async_dispatch_payload_kind";--> statement-breakpoint
DROP TYPE "public"."concept_block_kind";--> statement-breakpoint
DROP TYPE "public"."concept_category";--> statement-breakpoint
DROP TYPE "public"."concept_status";--> statement-breakpoint
DROP TYPE "public"."concept_validation_status";--> statement-breakpoint
DROP TYPE "public"."concept_version_status";--> statement-breakpoint
DROP TYPE "public"."content_import_item_kind";--> statement-breakpoint
DROP TYPE "public"."content_import_item_status";--> statement-breakpoint
DROP TYPE "public"."content_import_status";--> statement-breakpoint
DROP TYPE "public"."content_production_operation";--> statement-breakpoint
DROP TYPE "public"."content_production_purpose";--> statement-breakpoint
DROP TYPE "public"."job_item_status";--> statement-breakpoint
DROP TYPE "public"."job_status";--> statement-breakpoint
DROP TYPE "public"."job_type";