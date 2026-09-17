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
-- 기존 모든 문제 버전은 관리용 보관 스키마에 원본을 남긴다.
-- 앱은 현재 questions와 풀이별 question_snapshot만 조회한다.
CREATE SCHEMA IF NOT EXISTS migration_archive;
--> statement-breakpoint
CREATE TABLE migration_archive.question_graphs_0020 AS
SELECT v.id AS version_id, v.question_id,
  jsonb_build_object(
    'question', to_jsonb(q), 'version', to_jsonb(v),
    'tags', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM question_version_tags t WHERE t.question_version_id = v.id),
    'blocks', (SELECT coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('sentences',
      (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM question_block_sentences s WHERE s.block_id = b.id))), '[]'::jsonb)
      FROM question_blocks b WHERE b.question_version_id = v.id),
    'options', (SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM question_options o WHERE o.question_version_id = v.id)
  ) AS snapshot
FROM question_versions v JOIN questions q ON q.id = v.question_id;
--> statement-breakpoint
CREATE TEMP TABLE mvp_flat_versions ON COMMIT DROP AS
SELECT v.*,
  (SELECT string_agg(concat(CASE WHEN bs.speaker IS NULL THEN '' ELSE bs.speaker || ': ' END, s.original_text), E'\n' ORDER BY b.position, bs.position)
   FROM question_blocks b JOIN question_block_sentences bs ON bs.block_id = b.id JOIN thai_sentence_versions s ON s.id = bs.sentence_version_id
   WHERE b.question_version_id = v.id AND b.kind IN ('PASSAGE', 'DIALOGUE')) AS passage,
  coalesce((SELECT string_agg(s.original_text, E'\n' ORDER BY b.position, bs.position)
   FROM question_blocks b JOIN question_block_sentences bs ON bs.block_id = b.id JOIN thai_sentence_versions s ON s.id = bs.sentence_version_id
   WHERE b.question_version_id = v.id AND b.kind IN ('INSTRUCTION', 'QUESTION')), '') AS prompt,
  coalesce((SELECT string_agg(s.original_text, E'\n' ORDER BY b.position, bs.position)
   FROM question_blocks b JOIN question_block_sentences bs ON bs.block_id = b.id JOIN thai_sentence_versions s ON s.id = bs.sentence_version_id
   WHERE b.question_version_id = v.id AND b.kind = 'EXPLANATION'), '') AS explanation,
  (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'text', coalesce(s.original_text,
      (SELECT string_agg(t.surface, '' ORDER BY t.position) FROM token_occurrences t WHERE t.sentence_version_id = o.span_sentence_version_id AND t.position >= o.span_start_token_index AND t.position < o.span_end_token_index))) ORDER BY o.position)
   FROM question_options o LEFT JOIN thai_sentence_versions s ON s.id = o.sentence_version_id WHERE o.question_version_id = v.id) AS options,
  (SELECT o.id FROM question_options o WHERE o.question_version_id = v.id AND o.is_correct ORDER BY o.position LIMIT 1) AS correct_option_id,
  ARRAY(SELECT t.tag_id FROM question_version_tags t WHERE t.question_version_id = v.id ORDER BY t.tag_id) AS tag_ids
FROM question_versions v;
--> statement-breakpoint
UPDATE questions q SET
 type_version_id = v.type_version_id, topic_id = v.topic_id, tag_ids = v.tag_ids,
 passage = v.passage, prompt = v.prompt, options = v.options, correct_option_id = v.correct_option_id,
 explanation = v.explanation, difficulty = v.difficulty, version = v.version, published_at = v.published_at
FROM mvp_flat_versions v
WHERE v.id = coalesce(q.current_published_version_id, (SELECT latest.id FROM question_versions latest WHERE latest.question_id = q.id ORDER BY latest.version DESC LIMIT 1));
--> statement-breakpoint
UPDATE question_attempts a SET question_version = v.version,
 question_snapshot = jsonb_build_object('updatedAt', to_char(v.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'version', v.version, 'typeVersionId', v.type_version_id, 'difficulty', v.difficulty,
  'passage', v.passage, 'prompt', v.prompt, 'options', v.options, 'correctOptionId', v.correct_option_id, 'explanation', v.explanation)
FROM mvp_flat_versions v WHERE v.id = a.question_version_id AND v.question_id = a.question_id;
--> statement-breakpoint
UPDATE question_production_candidates c SET approved_question_version = v.version
FROM question_versions v WHERE v.id = c.approved_question_version_id AND v.question_id = c.approved_question_id;
--> statement-breakpoint
-- 같은 문장 참조를 중복 집계하지 않는다.
WITH current_versions AS (
 SELECT q.id question_id, v.id version_id FROM questions q JOIN question_versions v ON v.question_id = q.id AND v.version = q.version
), sentence_refs AS (
 SELECT cv.question_id, bs.sentence_version_id FROM current_versions cv
 JOIN question_blocks b ON b.question_version_id = cv.version_id AND b.kind <> 'EXPLANATION'
 JOIN question_block_sentences bs ON bs.block_id = b.id
 UNION
 SELECT cv.question_id, coalesce(o.sentence_version_id, o.span_sentence_version_id) FROM current_versions cv JOIN question_options o ON o.question_version_id = cv.version_id
), occurrences AS (
 SELECT r.question_id, t.vocabulary_id, t.meaning_id, t.role = 'TARGET' is_target
 FROM sentence_refs r JOIN token_occurrences t ON t.sentence_version_id = r.sentence_version_id
 UNION ALL
 SELECT r.question_id, e.vocabulary_id, e.meaning_id, false FROM sentence_refs r JOIN expression_occurrences e ON e.sentence_version_id = r.sentence_version_id
)
INSERT INTO question_vocabularies (question_id, vocabulary_id, meaning_id, role, occurrence_count)
SELECT question_id, vocabulary_id, CASE WHEN count(DISTINCT meaning_id) = 1 THEN (array_agg(meaning_id) FILTER (WHERE meaning_id IS NOT NULL))[1] ELSE NULL END,
 CASE WHEN bool_or(is_target) THEN 'TARGET'::question_vocabulary_role ELSE 'CONTEXT'::question_vocabulary_role END, count(*)::integer
FROM occurrences GROUP BY question_id, vocabulary_id;
--> statement-breakpoint
-- 신고 원본과 승인 감사 기록도 새 버전 식별 방식으로 변환한다.
UPDATE content_error_reports r SET canonical_reference = (r.canonical_reference - 'questionVersionId') || jsonb_build_object('questionVersion',
 (SELECT v.version FROM question_versions v WHERE v.id::text = r.canonical_reference->>'questionVersionId'));
--> statement-breakpoint
UPDATE audit_logs a SET summary = (a.summary - 'questionVersionId') || jsonb_build_object('questionVersion', v.version)
FROM question_versions v WHERE a.summary->>'questionVersionId' = v.id::text AND a.action LIKE 'QUESTION_CANDIDATE%';

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
