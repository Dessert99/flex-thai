/** PostgreSQL 16이 콘텐츠 가져오기 JSONB와 canonical 문자열 제약을 실제로 강제하는지 검증한다 */
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationDatabaseUrl =
  process.env.CONTENT_IMPORT_SCHEMA_TEST_DATABASE_URL;

interface IntegrationFixture {
  client: PoolClient;
  importId: string;
  userId: string;
}

const withFixture = async (
  pool: Pool,
  work: (fixture: IntegrationFixture) => Promise<void>,
): Promise<void> => {
  const client = await pool.connect();
  const userId = randomUUID();
  const importId = randomUUID();

  try {
    await client.query('begin');
    await client.query(
      `insert into users (id, cognito_sub, email, role, status)
       values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
      [userId, `content-import-${userId}`, `${userId}@example.com`],
    );
    await client.query(
      `insert into content_imports (
         id, requested_by, idempotency_key, request_hash,
         vocabulary_count, question_count
       ) values ($1, $2, $3, $4, 1, 2)`,
      [importId, userId, randomUUID(), 'a'.repeat(64)],
    );
    await work({ client, importId, userId });
  } finally {
    await client.query('rollback');
    client.release();
  }
};

const expectCheckViolation = async (
  client: PoolClient,
  query: string,
  values: unknown[],
): Promise<void> => {
  await client.query('savepoint malformed_content_import');
  try {
    await expect(client.query(query, values)).rejects.toMatchObject({
      code: '23514',
    });
  } finally {
    await client.query('rollback to savepoint malformed_content_import');
  }
};

const insertItemSql = `insert into content_import_items (
  id, import_id, kind, source_index, client_ref,
  status, target_id, errors, reference_map
) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`;

describe.runIf(integrationDatabaseUrl !== undefined)(
  '콘텐츠 가져오기 schema PostgreSQL 16 통합',
  () => {
    let pool: Pool;

    beforeAll(() => {
      if (!integrationDatabaseUrl) {
        throw new Error('CONTENT_IMPORT_SCHEMA_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('두 항목 종류의 flat UUID map과 exact 오류 object를 저장한다', async () => {
      await withFixture(pool, async ({ client, importId }) => {
        for (const [sourceIndex, kind] of [
          [0, 'VOCABULARY'],
          [0, 'QUESTION'],
        ] as const) {
          await client.query(insertItemSql, [
            randomUUID(),
            importId,
            kind,
            sourceIndex,
            `${kind.toLowerCase()}-item`,
            'IMPORTED',
            randomUUID(),
            '[]',
            JSON.stringify({ [`${kind.toLowerCase()}-ref`]: randomUUID() }),
          ]);
        }
        await client.query(insertItemSql, [
          randomUUID(),
          importId,
          'QUESTION',
          1,
          'rejected-question',
          'REJECTED',
          null,
          JSON.stringify([{ path: '', code: 'IMPORT_CONTENT_INVALID' }]),
          '{}',
        ]);

        const stored = await client.query<{ count: string }>(
          `select count(*) from content_import_items where import_id = $1`,
          [importId],
        );
        expect(stored.rows[0]?.count).toBe('3');
      });
    });

    it('오류 배열의 primitive·누락·잘못된 type·빈 code·추가 key를 거절한다', async () => {
      await withFixture(pool, async ({ client, importId }) => {
        const malformedErrors = [
          ['primitive'],
          [{}],
          [{ path: 1, code: 'IMPORT_CONTENT_INVALID' }],
          [{ path: '', code: '' }],
          [{ path: '', code: 'IMPORT_CONTENT_INVALID', extra: true }],
        ];

        for (const [sourceIndex, errors] of malformedErrors.entries()) {
          await expectCheckViolation(client, insertItemSql, [
            randomUUID(),
            importId,
            'QUESTION',
            sourceIndex,
            `rejected-${sourceIndex}`,
            'REJECTED',
            null,
            JSON.stringify(errors),
            '{}',
          ]);
        }
      });
    });

    it('빈·nested·null·number·non-UUID reference map을 거절한다', async () => {
      await withFixture(pool, async ({ client, importId }) => {
        const malformedReferenceMaps = [
          {},
          { '': randomUUID() },
          { ref: null },
          { ref: { id: randomUUID() } },
          { ref: 1 },
          { ref: 'not-a-uuid' },
        ];

        for (const [
          sourceIndex,
          referenceMap,
        ] of malformedReferenceMaps.entries()) {
          await expectCheckViolation(client, insertItemSql, [
            randomUUID(),
            importId,
            sourceIndex % 2 === 0 ? 'VOCABULARY' : 'QUESTION',
            sourceIndex,
            `imported-${sourceIndex}`,
            'IMPORTED',
            randomUUID(),
            '[]',
            JSON.stringify(referenceMap),
          ]);
        }
      });
    });

    it('빈 clientRef와 canonical SHA-256이 아닌 requestHash를 거절한다', async () => {
      await withFixture(pool, async ({ client, importId, userId }) => {
        await expectCheckViolation(client, insertItemSql, [
          randomUUID(),
          importId,
          'VOCABULARY',
          0,
          '',
          'IMPORTED',
          randomUUID(),
          '[]',
          JSON.stringify({ ref: randomUUID() }),
        ]);
        for (const requestHash of ['short', 'g'.repeat(64)]) {
          await expectCheckViolation(
            client,
            `insert into content_imports (
               id, requested_by, idempotency_key, request_hash,
               vocabulary_count, question_count
             ) values ($1, $2, $3, $4, 1, 0)`,
            [randomUUID(), userId, randomUUID(), requestHash],
          );
        }
        await client.query(
          `insert into content_imports (
             id, requested_by, idempotency_key, request_hash,
             vocabulary_count, question_count
           ) values ($1, $2, $3, $4, 1, 0)`,
          [randomUUID(), userId, randomUUID(), 'A'.repeat(64)],
        );
      });
    });
  },
);
