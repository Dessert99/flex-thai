/** 실제 PostgreSQL에서 provider claim과 stale lease 원자성을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAiVocabularyProductionRepository } from './drizzle-ai-vocabulary-production.repository.js';
import { DrizzleContentProductionRepository } from './drizzle-content-production.repository.js';

const databaseUrl = process.env.AI_VOCABULARY_TEST_DATABASE_URL;

describe.runIf(databaseUrl !== undefined)(
  'AI 어휘 제작 PostgreSQL 동시성',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error('AI_VOCABULARY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{ name: string | null }>(
        `select to_regclass('vocabulary_production_candidates')::text as name`,
      );

      if (!migration.rows[0]?.name) {
        throw new Error(
          'AI 어휘 제작 migration이 적용된 격리 DB가 필요합니다.',
        );
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    const createItem = async () => {
      const userId = randomUUID();
      const uploadId = randomUUID();
      const jobId = randomUUID();
      const jobInputId = randomUUID();
      const itemId = randomUUID();
      await pool.query(
        `insert into users (id, cognito_sub, email, role, status)
         values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
        [userId, `ai-vocab-${userId}`, `ai-vocab-${userId}@example.com`],
      );
      await pool.query(
        `insert into jobs (
           id, requested_by, client_request_id, type, purpose, status, attempt
         ) values (
           $1, $2, $3, 'VOCABULARY_EXTRACTION',
           'VOCABULARY_EXTRACTION', 'RUNNING', 0
        )`,
        [jobId, userId, randomUUID()],
      );
      await pool.query(
        `insert into uploads (
           id, owner_id, input_type, object_key, declared_content_type, status
         ) values ($1, $2, 'TEXT', $3, 'text/plain', 'VERIFIED')`,
        [uploadId, userId, `ai-vocab/${uploadId}.txt`],
      );
      await pool.query(
        `insert into job_inputs (id, job_id, upload_id, ordinal)
         values ($1, $2, $3, 0)`,
        [jobInputId, jobId, uploadId],
      );
      await pool.query(
        `insert into job_items (
           id, job_id, source_ref, status, attempt, lease_token, lease_until,
           job_input_id, operation
         ) values (
           $1, $2, 'fixture', 'PROCESSING', 0, 'active-token',
           now() + interval '5 minutes', $3, 'VOCABULARY_EXTRACTION'
         )`,
        [itemId, jobId, jobInputId],
      );
      return { itemId };
    };

    it('같은 provider 실행 key를 동시에 claim해도 외부 호출 소유자는 하나다', async () => {
      const { itemId } = await createItem();
      const repository = new DrizzleAiVocabularyProductionRepository(
        drizzle({ client: pool }),
      );
      const execution = {
        jobItemId: itemId,
        jobAttempt: 0,
        operation: 'VOCABULARY_EXTRACTION',
        sequence: 0,
        provider: 'LOCAL_FAKE',
        model: 'deterministic-v1',
        promptVersion: 'v1',
        itemLeaseToken: 'active-token',
      };

      const results = await Promise.all([
        repository.claim(execution),
        repository.claim(execution),
      ]);

      expect(
        results.filter((result) => result.kind === 'CLAIMED'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.kind === 'OUTCOME_UNKNOWN'),
      ).toHaveLength(1);
    });

    it('stale lease는 후보와 item terminal 상태를 하나도 쓰지 않는다', async () => {
      const { itemId } = await createItem();
      const repository = new DrizzleContentProductionRepository(
        drizzle({ client: pool }) as never,
      );

      await expect(
        repository.finishItem(randomUUID(), itemId, 0, 'stale-token', {
          status: 'SUCCEEDED',
          retryable: false,
          errorCode: null,
          artifacts: {
            kind: 'VOCABULARY_CANDIDATES',
            candidates: [],
            validations: [],
          },
        }),
      ).resolves.toBe(false);
      const state = await pool.query<{
        candidateCount: string;
        status: string;
      }>(
        `select
           (select count(*)::text from vocabulary_production_candidates
             where job_item_id = $1) "candidateCount",
           status
         from job_items where id = $1`,
        [itemId],
      );
      expect(state.rows[0]).toEqual({
        candidateCount: '0',
        status: 'PROCESSING',
      });
    });
  },
);
