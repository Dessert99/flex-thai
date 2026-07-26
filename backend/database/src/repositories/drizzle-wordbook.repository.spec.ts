/** 단어장 repository의 소유권·멱등 추가·고정 lock ordering을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as schema from '../schema/index.js';
import { wordbookItems, wordbooks } from '../schema/index.js';
import {
  DrizzleWordbookRepository,
  WordbookPersistenceError,
} from './drizzle-wordbook.repository.js';

type Rows = Array<Record<string, unknown>>;
type WriteCall = {
  kind: 'delete' | 'insert' | 'update';
  table: unknown;
  condition?: unknown;
  values?: unknown;
  conflict?: boolean;
};

const toParams = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as never).params;

const createFake = (options?: {
  selectResults?: Rows[];
  returningResults?: Rows[];
  insertError?: unknown;
}) => {
  const selectResults = [...(options?.selectResults ?? [])];
  const returningResults = [...(options?.returningResults ?? [])];
  const events: string[] = [];
  const selectCalls: Array<{
    condition?: unknown;
    from?: unknown;
    lock?: unknown;
    order?: unknown[];
  }> = [];
  const writeCalls: WriteCall[] = [];

  const select = vi.fn(() => {
    const call: (typeof selectCalls)[number] = {};
    selectCalls.push(call);
    const finish = () => Promise.resolve(selectResults.shift() ?? []);
    const chain = {
      from(table: unknown) {
        call.from = table;
        return chain;
      },
      where(condition: unknown) {
        call.condition = condition;
        return chain;
      },
      orderBy(...order: unknown[]) {
        call.order = order;
        return chain;
      },
      for(lock: unknown) {
        call.lock = lock;
        events.push('lock');
        return chain;
      },
      limit: finish,
      then(resolve: (rows: Rows) => unknown) {
        return finish().then(resolve);
      },
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => {
    const call: WriteCall = { kind: 'insert', table, conflict: false };
    writeCalls.push(call);
    return {
      values(values: unknown) {
        events.push('insert');
        call.values = values;
        const result = {
          onConflictDoNothing() {
            call.conflict = true;
            return {
              returning: () =>
                Promise.resolve(returningResults.shift() ?? []),
            };
          },
          returning() {
            if (options?.insertError) throw options.insertError;
            return Promise.resolve(returningResults.shift() ?? []);
          },
        };
        return result;
      },
    };
  });

  const update = vi.fn((table: unknown) => {
    const call: WriteCall = { kind: 'update', table };
    writeCalls.push(call);
    const chain = {
      set(values: unknown) {
        call.values = values;
        return chain;
      },
      where(condition: unknown) {
        call.condition = condition;
        return chain;
      },
      returning: () => Promise.resolve(returningResults.shift() ?? []),
    };
    return chain;
  });

  const remove = vi.fn((table: unknown) => {
    const call: WriteCall = { kind: 'delete', table };
    writeCalls.push(call);
    return {
      where(condition: unknown) {
        events.push('delete');
        call.condition = condition;
        return {
          returning: () => Promise.resolve(returningResults.shift() ?? []),
        };
      },
    };
  });

  const session = { delete: remove, insert, select, update };
  const transaction = vi.fn(
    <T>(work: (transaction: typeof session) => Promise<T>) => work(session),
  );
  return {
    database: {
      ...session,
      transaction,
    },
    events,
    selectCalls,
    writeCalls,
  };
};

const row = {
  id: '00000000-0000-4000-8000-000000000301',
  userId: '00000000-0000-4000-8000-000000000302',
  name: 'FLEX 어휘',
  createdAt: new Date('2026-07-26T00:00:00.000Z'),
  updatedAt: new Date('2026-07-26T00:00:00.000Z'),
};

describe('DrizzleWordbookRepository 단어장', () => {
  it('생성 결과 한 행을 반환하고 owner 조건으로 이름을 변경한다', async () => {
    const fake = createFake({ returningResults: [[row], [row]] });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await expect(
      repository.create(row.userId, row.name, row.createdAt),
    ).resolves.toEqual(row);
    await expect(
      repository.rename(row.userId, row.id, '듣기', row.updatedAt),
    ).resolves.toEqual(row);

    expect(fake.writeCalls[0]).toMatchObject({
      kind: 'insert',
      table: wordbooks,
      values: {
        userId: row.userId,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      },
    });
    expect(toParams(fake.writeCalls[1]?.condition)).toEqual([
      row.userId,
      row.id,
    ]);
  });

  it('같은 사용자 이름 unique 위반만 안정적인 충돌로 바꾼다', async () => {
    const fake = createFake({
      insertError: { code: '23505', constraint: 'wordbooks_user_name_unique' },
    });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await expect(
      repository.create(row.userId, row.name, row.createdAt),
    ).rejects.toMatchObject({
      code: 'WORDBOOK_NAME_CONFLICT',
      operation: 'create',
    });
  });

  it('소유 단어장 삭제 결과가 없으면 false를 반환한다', async () => {
    const fake = createFake({ returningResults: [[]] });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await expect(repository.delete(row.userId, row.id)).resolves.toBe(false);
  });
});

describe('DrizzleWordbookRepository 항목', () => {
  it('소유 단어장을 잠근 뒤 게시 어휘만 멱등 추가한다', async () => {
    const fake = createFake({
      selectResults: [[{ id: row.id }], [{ id: 'vocabulary-id' }]],
      returningResults: [[{ vocabularyId: 'vocabulary-id' }]],
    });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await expect(
      repository.addVocabulary(
        row.userId,
        row.id,
        'vocabulary-id',
        row.createdAt,
      ),
    ).resolves.toBe('ADDED');

    expect(fake.events).toEqual(['lock', 'insert']);
    expect(fake.writeCalls[0]).toMatchObject({
      kind: 'insert',
      table: wordbookItems,
      conflict: true,
    });
  });

  it('항목 제거는 어휘 상태를 조회하지 않고 없는 membership도 성공한다', async () => {
    const fake = createFake({ selectResults: [[{ id: row.id }]] });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await expect(
      repository.removeVocabulary(row.userId, row.id, 'vocabulary-id'),
    ).resolves.toBe(true);

    expect(fake.selectCalls).toHaveLength(1);
    expect(fake.writeCalls).toHaveLength(1);
    expect(fake.writeCalls[0]).toMatchObject({
      kind: 'delete',
      table: wordbookItems,
    });
  });

  it('없는 소유 단어장은 어휘를 조회하거나 변경하지 않는다', async () => {
    const fake = createFake({ selectResults: [[]] });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await expect(
      repository.addVocabulary(
        row.userId,
        row.id,
        'vocabulary-id',
        row.createdAt,
      ),
    ).resolves.toBe('WORDBOOK_NOT_FOUND');
    expect(fake.selectCalls).toHaveLength(1);
    expect(fake.writeCalls).toHaveLength(0);
  });

  it('bulk 이동은 한 transaction에서 두 단어장을 UUID 순서로 잠그고 복사 뒤 삭제한다', async () => {
    const targetId = '00000000-0000-4000-8000-000000000399';
    const fake = createFake({
      selectResults: [
        [{ id: row.id }, { id: targetId }],
        [{ vocabularyId: 'vocabulary-id', addedAt: row.createdAt }],
      ],
    });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await repository.moveVocabularies({
      userId: row.userId,
      sourceWordbookId: row.id,
      targetWordbookId: targetId,
      vocabularyIds: ['vocabulary-id'],
      transferredAt: row.createdAt,
    });

    expect(fake.selectCalls[0]?.lock).toBe('update');
    expect(fake.selectCalls[0]?.order).toHaveLength(1);
    expect(toParams(fake.selectCalls[0]?.condition)).toEqual([
      row.userId,
      row.id,
      targetId,
    ]);
    expect(fake.database.transaction).toHaveBeenCalledTimes(1);
    expect(fake.events).toEqual(['lock', 'insert', 'delete']);
  });

  it('선택 항목 제거는 source 소유권을 확인하고 delete만 수행한다', async () => {
    const fake = createFake({ selectResults: [[{ id: row.id }]] });
    const repository = new DrizzleWordbookRepository(fake.database as never);

    await expect(
      repository.removeVocabularies({
        userId: row.userId,
        wordbookId: row.id,
        vocabularyIds: ['vocabulary-id'],
      }),
    ).resolves.toBe(true);

    expect(fake.writeCalls).toHaveLength(1);
    expect(fake.writeCalls[0]?.kind).toBe('delete');
  });
});

describe('WordbookPersistenceError', () => {
  it('알 수 없는 저장 오류는 일반 persistence 충돌로 제한한다', () => {
    const error = new WordbookPersistenceError(
      'WORDBOOK_PERSISTENCE_CONFLICT',
      'unknown',
    );
    expect(error.message).toBe('WORDBOOK_PERSISTENCE_CONFLICT:unknown');
  });
});

const integrationDatabaseUrl =
  process.env.WORDBOOK_REPOSITORY_TEST_DATABASE_URL;

interface IntegrationFixture {
  sourceWordbookId: string;
  targetWordbookId: string;
  userId: string;
  vocabularyId: string;
}

const createIntegrationFixture = async (
  pool: Pool,
): Promise<IntegrationFixture> => {
  const fixture = {
    sourceWordbookId: randomUUID(),
    targetWordbookId: randomUUID(),
    userId: randomUUID(),
    vocabularyId: randomUUID(),
  };
  await pool.query(
    `insert into users (id, cognito_sub, email, status)
     values ($1, $2, $3, 'ACTIVE')`,
    [
      fixture.userId,
      `wordbook-${fixture.userId}`,
      `${fixture.userId}@example.com`,
    ],
  );
  await pool.query(
    `insert into vocabularies (id, thai, normalized_thai, kind, status)
     values ($1, $2, $2, 'WORD', 'PUBLISHED')`,
    [fixture.vocabularyId, `คำ-${fixture.vocabularyId}`],
  );
  await pool.query(
    `insert into wordbooks (id, user_id, name, created_at, updated_at)
     values ($1, $3, 'A', now(), now()), ($2, $3, 'B', now(), now())`,
    [
      fixture.sourceWordbookId,
      fixture.targetWordbookId,
      fixture.userId,
    ],
  );
  await pool.query(
    `insert into wordbook_items (wordbook_id, vocabulary_id, added_at)
     values ($1, $2, now())`,
    [fixture.sourceWordbookId, fixture.vocabularyId],
  );
  return fixture;
};

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleWordbookRepository PostgreSQL 16 동시성',
  () => {
    let pool: Pool;
    let repository: DrizzleWordbookRepository;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('WORDBOOK_REPOSITORY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      const version = await pool.query<{ serverVersionNum: string }>(
        `select current_setting('server_version_num') "serverVersionNum"`,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeGreaterThanOrEqual(
        160000,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeLessThan(170000);
      repository = new DrizzleWordbookRepository(
        drizzle({ client: pool, schema }),
      );
    });

    afterAll(async () => {
      await pool.end();
    });

    it('동일 이름 동시 생성은 하나만 성공하고 하나는 이름 충돌한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const name = `동시-${randomUUID()}`;

      const settled = await Promise.allSettled([
        repository.create(fixture.userId, name, new Date()),
        repository.create(fixture.userId, name, new Date()),
      ]);

      expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(
        1,
      );
      const rejected = settled.find(({ status }) => status === 'rejected');
      expect(rejected).toMatchObject({
        reason: { code: 'WORDBOOK_NAME_CONFLICT' },
      });
    });

    it('A→B와 B→A 동시 이동은 고정 lock 순서로 deadlock 없이 끝난다', async () => {
      const fixture = await createIntegrationFixture(pool);

      await expect(
        Promise.all([
          repository.moveVocabularies({
            userId: fixture.userId,
            sourceWordbookId: fixture.sourceWordbookId,
            targetWordbookId: fixture.targetWordbookId,
            vocabularyIds: [fixture.vocabularyId],
            transferredAt: new Date(),
          }),
          repository.moveVocabularies({
            userId: fixture.userId,
            sourceWordbookId: fixture.targetWordbookId,
            targetWordbookId: fixture.sourceWordbookId,
            vocabularyIds: [fixture.vocabularyId],
            transferredAt: new Date(),
          }),
        ]),
      ).resolves.toEqual([true, true]);
    });

    it('source 삭제와 이동 경합 뒤 membership은 부분 복사되지 않는다', async () => {
      const fixture = await createIntegrationFixture(pool);

      await Promise.all([
        repository.delete(fixture.userId, fixture.sourceWordbookId),
        repository.moveVocabularies({
          userId: fixture.userId,
          sourceWordbookId: fixture.sourceWordbookId,
          targetWordbookId: fixture.targetWordbookId,
          vocabularyIds: [fixture.vocabularyId],
          transferredAt: new Date(),
        }),
      ]);

      const memberships = await pool.query<{ wordbookId: string }>(
        `select wordbook_id "wordbookId"
           from wordbook_items
          where vocabulary_id = $1`,
        [fixture.vocabularyId],
      );
      expect(
        memberships.rows.every(
          ({ wordbookId }) => wordbookId === fixture.targetWordbookId,
        ),
      ).toBe(true);
    });
  },
);
