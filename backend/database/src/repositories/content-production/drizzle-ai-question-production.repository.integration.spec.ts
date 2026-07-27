/** 실제 PostgreSQL에서 AI 문제 artifact replay와 transaction rollback을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAiQuestionProductionRepository } from './drizzle-ai-question-production.repository.js';

const databaseUrl = process.env.AI_QUESTION_TEST_DATABASE_URL;

describe.runIf(databaseUrl !== undefined)(
  'AI 문제 제작 PostgreSQL 원자성',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!databaseUrl)
        throw new Error('AI_QUESTION_TEST_DATABASE_URL_REQUIRED');
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{ name: string | null }>(
        `select to_regclass('question_production_candidates')::text as name`,
      );
      if (!migration.rows[0]?.name) {
        throw new Error(
          'AI 문제 제작 migration이 적용된 격리 DB가 필요합니다.',
        );
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    const createFixture = async () => {
      const userId = randomUUID();
      const jobId = randomUUID();
      const uploadId = randomUUID();
      const jobInputId = randomUUID();
      const itemId = randomUUID();
      const questionTypeId = randomUUID();
      const typeVersionId = randomUUID();
      const topicId = randomUUID();
      await pool.query(
        `insert into users (id, cognito_sub, email, role, status)
       values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
        [userId, `ai-question-${userId}`, `ai-question-${userId}@example.com`],
      );
      await pool.query(
        `insert into jobs (id, requested_by, client_request_id, type, purpose, status, attempt)
       values ($1, $2, $3, 'QUESTION_GENERATION', 'QUESTION_GENERATION', 'RUNNING', 0)`,
        [jobId, userId, randomUUID()],
      );
      await pool.query(
        `insert into uploads (id, owner_id, input_type, object_key, declared_content_type, status)
       values ($1, $2, 'TEXT', $3, 'text/plain', 'VERIFIED')`,
        [uploadId, userId, `ai-question/${uploadId}.txt`],
      );
      await pool.query(
        `insert into job_inputs (id, job_id, upload_id, ordinal) values ($1, $2, $3, 0)`,
        [jobInputId, jobId, uploadId],
      );
      await pool.query(
        `insert into job_items (
         id, job_id, job_input_id, operation, source_ref, status, attempt,
         lease_token, lease_until
       ) values ($1, $2, $3, 'QUESTION_GENERATION', 'fixture', 'PROCESSING', 0,
         'active-token', now() + interval '5 minutes')`,
        [itemId, jobId, jobInputId],
      );
      await pool.query(
        `insert into question_types (id, slug, display_name, skill, major_category)
       values ($1, $2, '선택형', 'READING', 'READING_VOCABULARY_GRAMMAR')`,
        [questionTypeId, `reading-choice-${questionTypeId}`],
      );
      await pool.query(
        `insert into question_type_versions (
         id, question_type_id, version, template, option_count, status, decision_rules
       ) values ($1, $2, 1, 'STANDARD_CHOICE', 4, 'ACTIVE', '{}')`,
        [typeVersionId, questionTypeId],
      );
      await pool.query(
        `insert into question_topics (id, slug, display_name, status)
       values ($1, $2, '일반', 'ACTIVE')`,
        [topicId, `general-${topicId}`],
      );
      return { itemId, jobId, typeVersionId, topicId };
    };

    const persistenceInput = (
      fixture: Awaited<ReturnType<typeof createFixture>>,
      payloadHash: string,
    ) => ({
      jobId: fixture.jobId,
      itemId: fixture.itemId,
      attempt: 0,
      leaseToken: 'active-token',
      outcome: {
        status: 'SUCCEEDED' as const,
        retryable: false,
        errorCode: null,
        result: { total: 1 },
      },
      artifacts: {
        kind: 'QUESTION_CANDIDATES' as const,
        candidates: [
          {
            ordinal: 0,
            candidate: {
              questionTypeVersionId: fixture.typeVersionId,
              topicId: fixture.topicId,
              tagIds: [],
              difficulty: 3,
              payload: { questionTypeSlug: 'reading-choice' } as never,
            },
            payloadHash,
            resultGroup: 'NORMAL' as const,
            reviewStatus: 'PENDING' as const,
            reviewCode: null,
            regeneratedFromCandidateId: null,
            approvedQuestionId: null,
            approvedQuestionVersionId: null,
          },
        ],
        validations: [
          {
            candidateOrdinal: 0,
            stage: 'SCHEMA' as const,
            status: 'PASSED' as const,
            code: null,
            details: {},
          },
        ],
      },
    });

    it('같은 candidate와 validation replay는 unique row를 늘리지 않는다', async () => {
      const fixture = await createFixture();
      const candidateId = randomUUID();
      const payloadHash = 'a'.repeat(64);
      await pool.query(
        `insert into question_production_candidates (
         id, job_item_id, job_attempt, ordinal, type_version_id, topic_id,
         difficulty, payload, payload_hash, result_group, review_status
       ) values ($1, $2, 0, 0, $3, $4, 3, $5, $6, 'NORMAL', 'PENDING')`,
        [
          candidateId,
          fixture.itemId,
          fixture.typeVersionId,
          fixture.topicId,
          { questionTypeSlug: 'reading-choice' },
          payloadHash,
        ],
      );
      await pool.query(
        `insert into question_production_validations (candidate_id, stage, status, code, details)
       values ($1, 'SCHEMA', 'PASSED', null, '{}')`,
        [candidateId],
      );
      const repository = new DrizzleAiQuestionProductionRepository(
        drizzle({ client: pool }) as never,
      );

      await expect(
        repository.persist(persistenceInput(fixture, payloadHash)),
      ).resolves.toBe(true);
      const counts = await pool.query<{
        candidates: string;
        validations: string;
      }>(
        `select
         (select count(*)::text from question_production_candidates where job_item_id = $1) candidates,
         (select count(*)::text from question_production_validations where candidate_id = $2) validations`,
        [fixture.itemId, candidateId],
      );
      expect(counts.rows[0]).toEqual({ candidates: '1', validations: '1' });
    });

    it('candidate replay가 다르면 terminal update까지 rollback한다', async () => {
      const fixture = await createFixture();
      await pool.query(
        `insert into question_production_candidates (
         job_item_id, job_attempt, ordinal, type_version_id, topic_id,
         difficulty, payload, payload_hash, result_group, review_status
       ) values ($1, 0, 0, $2, $3, 3, $4, $5, 'NORMAL', 'PENDING')`,
        [
          fixture.itemId,
          fixture.typeVersionId,
          fixture.topicId,
          { questionTypeSlug: 'reading-choice' },
          'b'.repeat(64),
        ],
      );
      const repository = new DrizzleAiQuestionProductionRepository(
        drizzle({ client: pool }) as never,
      );

      await expect(
        repository.persist(persistenceInput(fixture, 'a'.repeat(64))),
      ).rejects.toThrow('QUESTION_CANDIDATE_REPLAY_CONFLICT');
      const item = await pool.query<{
        status: string;
        leaseToken: string | null;
      }>(
        `select status, lease_token "leaseToken" from job_items where id = $1`,
        [fixture.itemId],
      );
      expect(item.rows[0]).toEqual({
        status: 'PROCESSING',
        leaseToken: 'active-token',
      });
    });
  },
);
