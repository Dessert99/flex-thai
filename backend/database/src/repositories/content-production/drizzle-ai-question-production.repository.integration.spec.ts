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

    const createFixture = async (options?: { createTopic?: boolean }) => {
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
      if (options?.createTopic !== false) {
        await pool.query(
          `insert into question_topics (id, slug, display_name, status)
       values ($1, $2, '일반', 'ACTIVE')`,
          [topicId, `general-${topicId}`],
        );
      }
      return { itemId, jobId, typeVersionId, topicId, userId };
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
              payloadState: 'CANONICAL' as const,
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
         id, job_item_id, job_attempt, ordinal, type_version_id, payload_state,
         topic_id, difficulty, payload, payload_hash, result_group, review_status
       ) values ($1, $2, 0, 0, $3, 'CANONICAL', $4, 3, $5, $6, 'NORMAL', 'PENDING')`,
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

    it('topic row 없이 redacted 후보와 네 검증·terminal 전이를 함께 commit한다', async () => {
      const fixture = await createFixture({ createTopic: false });
      const repository = new DrizzleAiQuestionProductionRepository(
        drizzle({ client: pool }) as never,
      );
      const redacted: Parameters<
        DrizzleAiQuestionProductionRepository['persist']
      >[0] = {
        jobId: fixture.jobId,
        itemId: fixture.itemId,
        attempt: 0,
        leaseToken: 'active-token',
        outcome: {
          status: 'NEEDS_ATTENTION',
          retryable: false,
          errorCode: null,
          result: { total: 1 },
        },
        artifacts: {
          kind: 'QUESTION_CANDIDATES',
          candidates: [
            {
              ordinal: 0,
              candidate: {
                payloadState: 'REDACTED_INVALID',
                questionTypeVersionId: fixture.typeVersionId,
                topicId: null,
                tagIds: [],
                difficulty: null,
                payload: null,
              },
              payloadHash:
                '79732325ba08de315b7ed66b263eacf3222cb949fc1d2063d536cf7312775eb8',
              resultGroup: 'FAILED',
              reviewStatus: 'PENDING',
              reviewCode: 'QUESTION_SCHEMA_INVALID',
              regeneratedFromCandidateId: null,
              approvedQuestionId: null,
              approvedQuestionVersionId: null,
            },
          ],
          validations: [
            {
              candidateOrdinal: 0,
              stage: 'SCHEMA',
              status: 'FAILED',
              code: 'QUESTION_SCHEMA_INVALID',
              details: {},
            },
            ...(
              ['DECISION_RULE', 'SIMILARITY', 'AI_CROSS_VALIDATION'] as const
            ).map((stage) => ({
              candidateOrdinal: 0,
              stage,
              status: 'SKIPPED' as const,
              code: 'QUESTION_VALIDATION_SKIPPED' as const,
              details: {},
            })),
          ],
        },
      };

      await expect(repository.persist(redacted)).resolves.toBe(true);
      const stored = await pool.query<{
        candidateCount: string;
        validationCount: string;
        topicId: string | null;
        payload: unknown;
        status: string;
      }>(
        `select
           count(*) over ()::text "candidateCount",
           (select count(*)::text from question_production_validations where candidate_id = c.id) "validationCount",
           c.topic_id "topicId",
           c.payload,
           i.status
         from question_production_candidates c
         join job_items i on i.id = c.job_item_id
         where c.job_item_id = $1`,
        [fixture.itemId],
      );
      expect(stored.rows[0]).toEqual({
        candidateCount: '1',
        validationCount: '4',
        topicId: null,
        payload: null,
        status: 'NEEDS_ATTENTION',
      });
    });

    it('candidate replay가 다르면 terminal update까지 rollback한다', async () => {
      const fixture = await createFixture();
      await pool.query(
        `insert into question_production_candidates (
         job_item_id, job_attempt, ordinal, type_version_id, payload_state,
         topic_id, difficulty, payload, payload_hash, result_group, review_status
       ) values ($1, 0, 0, $2, 'CANONICAL', $3, 3, $4, $5, 'NORMAL', 'PENDING')`,
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

    it('서로 다른 후보의 같은 request ID 동시 command는 한 건만 반영한다', async () => {
      const fixture = await createFixture();
      const candidateIds = [randomUUID(), randomUUID()];
      await pool.query(
        `insert into question_production_candidates (
         id, job_item_id, job_attempt, ordinal, type_version_id, payload_state,
         topic_id, difficulty, payload, payload_hash, result_group, review_status
       ) values
         ($1, $3, 0, 0, $4, 'CANONICAL', $5, 3, $6, $7, 'NORMAL', 'PENDING'),
         ($2, $3, 0, 1, $4, 'CANONICAL', $5, 3, $6, $8, 'NORMAL', 'PENDING')`,
        [
          candidateIds[0],
          candidateIds[1],
          fixture.itemId,
          fixture.typeVersionId,
          fixture.topicId,
          { questionTypeSlug: 'reading-choice' },
          'c'.repeat(64),
          'd'.repeat(64),
        ],
      );
      const repository = new DrizzleAiQuestionProductionRepository(
        drizzle({ client: pool }) as never,
      );
      const requestId = randomUUID();
      const command = (candidateId: string) => ({
        candidateId,
        expectedRevision: 0,
        actorUserId: fixture.userId,
        actorSub: `ai-question-${fixture.userId}`,
        requestId,
        occurredAt: new Date('2026-07-27T04:00:00.000Z'),
      });

      const results = await Promise.allSettled(
        candidateIds.map((candidateId) =>
          repository.discard(command(candidateId)),
        ),
      );
      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      const success = results.find(({ status }) => status === 'fulfilled');
      expect(success?.status === 'fulfilled' ? success.value : null).toBe(true);
      const rejection = results.find(({ status }) => status === 'rejected');
      const reason: unknown =
        rejection?.status === 'rejected' ? rejection.reason : null;
      expect(reason).toMatchObject({
        code: 'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT',
      });

      const candidates = await pool.query<{
        reviewStatus: string;
        revision: number;
      }>(
        `select review_status "reviewStatus", revision
         from question_production_candidates
         where id = any($1::uuid[])
         order by revision desc`,
        [candidateIds],
      );
      expect(candidates.rows).toEqual([
        { reviewStatus: 'DISCARDED', revision: 1 },
        { reviewStatus: 'PENDING', revision: 0 },
      ]);
      const audit = await pool.query<{ count: string }>(
        `select count(*)::text count
         from audit_logs
         where target_type = 'QUESTION_CANDIDATE' and request_id = $1`,
        [requestId],
      );
      expect(audit.rows[0]?.count).toBe('1');
    });
  },
);
