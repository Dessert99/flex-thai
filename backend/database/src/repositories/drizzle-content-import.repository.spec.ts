/** 콘텐츠 가져오기 claim·REJECTED 저장·최초 완료 audit transaction을 고정한다 */
import { randomUUID } from 'node:crypto';
import type {
  CompleteContentImportInput,
  ContentImportRecord,
  SaveRejectedContentImportItemInput,
} from '@flex-thia/domain';
import {
  ContentDraftService,
  ContentImportError,
  ContentImportService,
  hashContentImportRequest,
  type ContentImportCommand,
  type ContentImportRequest,
} from '@flex-thia/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  auditLogs,
  contentImportItems,
  contentImports,
} from '../schema/index.js';
import * as schema from '../schema/index.js';
import { DrizzleContentDraftRepository } from './drizzle-content-draft.repository.js';
import {
  ContentImportPersistenceError,
  DrizzleContentImportRepository,
} from './drizzle-content-import.repository.js';

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  import: '00000000-0000-4000-8000-000000000002',
} as const;

const occurredAt = new Date('2026-07-24T00:00:00.000Z');

const record = (
  overrides: Partial<ContentImportRecord> = {},
): ContentImportRecord => ({
  id: ids.import,
  requestedBy: ids.actor,
  idempotencyKey: '00000000-0000-4000-8000-000000000099',
  requestHash: 'a'.repeat(64),
  status: null,
  vocabularyCount: 1,
  questionCount: 1,
  importedCount: 0,
  rejectedCount: 0,
  createdAt: occurredAt,
  completedAt: null,
  ...overrides,
});

const createClaimDatabase = (stored = record()) => {
  const insertedValues: unknown[] = [];
  const conflictTargets: unknown[] = [];
  const transactionValue = {
    insert: vi.fn((table: unknown) => {
      expect(table).toBe(contentImports);
      const chain = {
        values: vi.fn((values: unknown) => {
          insertedValues.push(values);
          return chain;
        }),
        onConflictDoNothing: vi.fn((options: unknown) => {
          conflictTargets.push(options);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue([{ id: ids.import }]),
      };
      return chain;
    }),
    select: vi.fn(() => {
      const chain = {
        from: vi.fn((table: unknown) => {
          expect(table).toBe(contentImports);
          return chain;
        }),
        where: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue([stored]),
      };
      return chain;
    }),
  };
  return {
    database: {
      transaction: vi.fn(
        <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
          work(transactionValue),
      ),
    },
    insertedValues,
    conflictTargets,
  };
};

const createRejectedDatabase = () => {
  const calls: Array<{ table: unknown; values?: unknown }> = [];
  const transactionValue = {
    insert: vi.fn((table: unknown) => {
      const call = { table, values: undefined as unknown };
      calls.push(call);
      const chain = {
        values: vi.fn((values: unknown) => {
          call.values = values;
          return chain;
        }),
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
      };
      return chain;
    }),
    select: vi.fn(() => {
      const chain = {
        from: vi.fn((table: unknown) => {
          expect(table).toBe(contentImportItems);
          return chain;
        }),
        where: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue([
          {
            kind: 'VOCABULARY',
            sourceIndex: 0,
            clientRef: 'vocabulary-ref',
            status: 'IMPORTED',
            targetId: '00000000-0000-4000-8000-000000000003',
            errors: [],
          },
        ]),
      };
      return chain;
    }),
  };
  return {
    calls,
    database: {
      transaction: vi.fn(
        <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
          work(transactionValue),
      ),
    },
  };
};

const completeInput: CompleteContentImportInput = {
  importId: ids.import,
  completedAt: occurredAt,
  context: {
    actorSub: 'cognito-sub',
    actorUserId: ids.actor,
    requestId: 'request-id',
    occurredAt,
  },
};

const createCompletionDatabase = (options?: {
  current?: ContentImportRecord;
  itemStatuses?: Array<'IMPORTED' | 'REJECTED'>;
  updated?: boolean;
}) => {
  const selectResults = [
    [options?.current ?? record()],
    (options?.itemStatuses ?? ['IMPORTED', 'REJECTED']).map((status) => ({
      status,
    })),
  ];
  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const updates: unknown[] = [];
  const transactionValue = {
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        for: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve(selectResults.shift() ?? [])),
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (error: unknown) => unknown,
        ) => Promise.resolve(selectResults.shift() ?? []).then(resolve, reject),
      };
      return chain;
    }),
    update: vi.fn((table: unknown) => {
      expect(table).toBe(contentImports);
      const chain = {
        set: vi.fn((values: unknown) => {
          updates.push(values);
          return chain;
        }),
        where: vi.fn(() => chain),
        returning: vi
          .fn()
          .mockResolvedValue(
            options?.updated === false ? [] : [{ id: ids.import }],
          ),
      };
      return chain;
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        inserted.push({ table, values });
        return Promise.resolve();
      }),
    })),
  };
  return {
    database: {
      transaction: vi.fn(
        <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
          work(transactionValue),
      ),
    },
    inserted,
    updates,
    transactionValue,
  };
};

describe('DrizzleContentImportRepository가 콘텐츠 import 요청의 claim을 처리한다', () => {
  it('원본 body 없이 user·UUID key unique row를 생성하거나 기존 row를 반환한다', async () => {
    const fake = createClaimDatabase();
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    const result = await repository.claim({
      id: ids.import,
      requestedBy: ids.actor,
      idempotencyKey: record().idempotencyKey,
      requestHash: record().requestHash,
      vocabularyCount: 1,
      questionCount: 1,
      createdAt: occurredAt,
    });

    expect(result).toEqual(record());
    expect(fake.insertedValues[0]).not.toHaveProperty('request');
    expect(fake.insertedValues[0]).not.toHaveProperty('payload');
    expect(fake.conflictTargets).toEqual([
      {
        target: [contentImports.requestedBy, contentImports.idempotencyKey],
      },
    ]);
  });
});

describe('DrizzleContentImportRepository 항목 처리', () => {
  it('REJECTED insert 충돌 시 existing IMPORTED item을 재조회해 그대로 replay한다', async () => {
    const fake = createRejectedDatabase();
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );
    const input: SaveRejectedContentImportItemInput = {
      importId: ids.import,
      kind: 'VOCABULARY',
      sourceIndex: 0,
      clientRef: 'vocabulary-ref',
      errors: [{ path: 'thai', code: 'IMPORT_CONTENT_INVALID' }],
    };

    await expect(repository.saveRejectedItem(input)).resolves.toMatchObject({
      status: 'IMPORTED',
      targetId: '00000000-0000-4000-8000-000000000003',
    });
    expect(fake.calls).toEqual([
      {
        table: contentImportItems,
        values: {
          importId: ids.import,
          kind: 'VOCABULARY',
          sourceIndex: 0,
          clientRef: 'vocabulary-ref',
          status: 'REJECTED',
          targetId: null,
          errors: input.errors,
          referenceMap: {},
        },
      },
    ]);
  });
});

describe('DrizzleContentImportRepository 완료', () => {
  it('unique item row를 집계해 conditional final status와 audit을 같은 transaction에 저장한다', async () => {
    const fake = createCompletionDatabase();
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    await repository.complete(completeInput);

    expect(fake.updates).toEqual([
      {
        status: 'COMPLETED_WITH_FAILURES',
        importedCount: 1,
        rejectedCount: 1,
        completedAt: occurredAt,
      },
    ]);
    expect(fake.inserted).toEqual([
      {
        table: auditLogs,
        values: {
          actorSub: 'cognito-sub',
          actorUserId: ids.actor,
          action: 'CONTENT_IMPORT_COMPLETED',
          target: ids.import,
          targetType: 'CONTENT_IMPORT',
          targetId: ids.import,
          summary: {
            importedCount: 1,
            rejectedCount: 1,
            status: 'COMPLETED_WITH_FAILURES',
          },
          requestId: 'request-id',
          createdAt: occurredAt,
        },
      },
    ]);
  });

  it('이미 완료된 concurrent caller는 중복 update와 audit 없이 종료한다', async () => {
    const fake = createCompletionDatabase({
      current: record({
        status: 'COMPLETED',
        importedCount: 2,
        completedAt: occurredAt,
      }),
    });
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    await repository.complete(completeInput);

    expect(fake.transactionValue.update).not.toHaveBeenCalled();
    expect(fake.transactionValue.insert).not.toHaveBeenCalled();
  });

  it('item 집계가 total과 다르면 완료로 위장하지 않는다', async () => {
    const fake = createCompletionDatabase({ itemStatuses: ['IMPORTED'] });
    const repository = new DrizzleContentImportRepository(
      fake.database as never,
    );

    await expect(repository.complete(completeInput)).rejects.toEqual(
      new ContentImportPersistenceError('completeItemCount'),
    );
    expect(fake.transactionValue.update).not.toHaveBeenCalled();
    expect(fake.transactionValue.insert).not.toHaveBeenCalled();
  });
});

const integrationDatabaseUrl =
  process.env.CONTENT_IMPORT_REPOSITORY_TEST_DATABASE_URL;

interface IntegrationFixture {
  command: ContentImportCommand;
  idempotencyKey: string;
  request: ContentImportRequest;
  userId: string;
}

const createIntegrationFixture = async (
  pool: Pool,
  questionCount = 1,
): Promise<IntegrationFixture> => {
  const userId = randomUUID();
  const mediaId = randomUUID();
  const typeId = randomUUID();
  const typeVersionId = randomUUID();
  const idempotencyKey = randomUUID();
  const typeSlug = `task6-${randomUUID()}`;
  const sha256 = 'a'.repeat(64);
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [userId, `task6-${userId}`, `${userId}@example.com`],
  );
  await pool.query(
    `insert into media_assets (
       id, storage_key, declared_mime_type, declared_size_bytes,
       declared_sha256, mime_type, size_bytes, sha256, status, ready_at
     ) values ($1, $2, 'audio/mpeg', 3, $3, 'audio/mpeg', 3, $3, 'READY', now())`,
    [mediaId, `audio/${mediaId}`, sha256],
  );
  await pool.query(
    `insert into question_types (id, slug, display_name, skill)
     values ($1, $2, 'Task 6 통합 유형', 'READING')`,
    [typeId, typeSlug],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 1, '{}')`,
    [typeVersionId, typeId],
  );
  const sentence = {
    originalText: 'ก',
    translationKo: '뜻',
    pronunciationKo: '꺼',
    toneMarks: '-',
    mediaAssetId: mediaId,
    tokens: [],
    expressions: [],
  };
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const questionRef = `question-${index}`;
    return {
      clientRef: questionRef,
      questionTypeSlug: typeSlug,
      questionTypeVersion: 1,
      difficulty: 1,
      blocks: [
        {
          kind: 'QUESTION' as const,
          displayMode: 'TEXT' as const,
          sentences: [{ sentence }],
        },
      ],
      options: [
        {
          clientRef: `${questionRef}-option`,
          position: 0,
          sentence,
          span: null,
        },
      ],
      correctOptionRef: `${questionRef}-option`,
    };
  });
  const request: ContentImportRequest = {
    schemaVersion: 1,
    vocabularies: [],
    questions,
  };
  return {
    userId,
    idempotencyKey,
    request,
    command: {
      requestedBy: userId,
      idempotencyKey,
      request,
      context: {
        actorSub: `task6-${userId}`,
        actorUserId: userId,
        requestId: `request-${idempotencyKey}`,
        occurredAt,
      },
    },
  };
};

const createIntegrationService = (pool: Pool): ContentImportService => {
  const database = drizzle({ client: pool, schema });
  return new ContentImportService(
    new DrizzleContentImportRepository(database),
    new ContentDraftService(new DrizzleContentDraftRepository(database)),
  );
};

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleContentImportRepository PostgreSQL 16 통합',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('CONTENT_IMPORT_REPOSITORY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      const version = await pool.query<{ server_version_num: string }>(
        `select current_setting('server_version_num') as server_version_num`,
      );
      const versionNumber = Number(version.rows[0]?.server_version_num);
      expect(versionNumber).toBeGreaterThanOrEqual(160000);
      expect(versionNumber).toBeLessThan(170000);
    });

    afterAll(async () => {
      await pool.end();
    });

    it('동일 요청 동시 호출은 import·item·draft·완료 audit을 하나만 만든다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const first = createIntegrationService(pool);
      const second = createIntegrationService(pool);

      const [firstResult, secondResult] = await Promise.all([
        first.execute(fixture.command),
        second.execute(fixture.command),
      ]);

      expect(firstResult).toEqual(secondResult);
      expect(firstResult).toMatchObject({
        status: 'COMPLETED',
        importedCount: 1,
        rejectedCount: 0,
      });
      const stored = await pool.query<{
        imports: string;
        items: string;
        drafts: string;
        importAudits: string;
        draftAudits: string;
      }>(
        `select
           (select count(*) from content_imports
             where requested_by = $1 and idempotency_key = $2) as imports,
           (select count(*) from content_import_items ci
             join content_imports c on c.id = ci.import_id
             where c.requested_by = $1 and c.idempotency_key = $2) as items,
           (select count(*) from questions q
             join content_import_items ci on ci.target_id = q.id
             join content_imports c on c.id = ci.import_id
             where c.requested_by = $1 and c.idempotency_key = $2) as drafts,
           (select count(*) from audit_logs a
             join content_imports c on c.id = a.target_id
             where c.requested_by = $1 and c.idempotency_key = $2
               and a.action = 'CONTENT_IMPORT_COMPLETED') as "importAudits",
           (select count(*) from audit_logs a
             join content_import_items ci on ci.target_id = a.target_id
             join content_imports c on c.id = ci.import_id
             where c.requested_by = $1 and c.idempotency_key = $2
               and a.action = 'CONTENT_QUESTION_DRAFT_IMPORTED') as "draftAudits"`,
        [fixture.userId, fixture.idempotencyKey],
      );
      expect(stored.rows[0]).toEqual({
        imports: '1',
        items: '1',
        drafts: '1',
        importAudits: '1',
        draftAudits: '1',
      });
    });

    it('같은 user·key의 다른 hash는 기존 결과와 draft를 바꾸지 않는다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = createIntegrationService(pool);
      const original = await service.execute(fixture.command);
      const changedRequest: ContentImportRequest = {
        ...fixture.request,
        questions: fixture.request.questions.map((question) => ({
          ...question,
          difficulty: 2,
        })),
      };

      await expect(
        service.execute({
          ...fixture.command,
          request: changedRequest,
        }),
      ).rejects.toEqual(
        new ContentImportError('CONTENT_IMPORT_IDEMPOTENCY_CONFLICT'),
      );
      const stored = await pool.query<{
        itemCount: string;
        questionCount: string;
        requestHash: string;
      }>(
        `select
           c.request_hash as "requestHash",
           (select count(*) from content_import_items where import_id = c.id) as "itemCount",
           (select count(*) from questions q
             join content_import_items ci on ci.target_id = q.id
             where ci.import_id = c.id) as "questionCount"
         from content_imports c
         where c.requested_by = $1 and c.idempotency_key = $2`,
        [fixture.userId, fixture.idempotencyKey],
      );
      expect(stored.rows[0]).toEqual({
        requestHash: hashContentImportRequest(fixture.request),
        itemCount: '1',
        questionCount: '1',
      });
      await expect(service.execute(fixture.command)).resolves.toEqual(original);
    });

    it('한 item 실패는 앞선 draft를 유지하고 REJECTED만 저장한 뒤 replay한다', async () => {
      const fixture = await createIntegrationFixture(pool, 2);
      const failedRequest: ContentImportRequest = {
        ...fixture.request,
        questions: fixture.request.questions.map((question, index) =>
          index === 1
            ? { ...question, questionTypeSlug: `missing-${randomUUID()}` }
            : question,
        ),
      };
      const command = { ...fixture.command, request: failedRequest };
      const service = createIntegrationService(pool);

      const result = await service.execute(command);
      const replay = await service.execute(command);

      expect(result).toEqual(replay);
      expect(result).toMatchObject({
        status: 'COMPLETED_WITH_FAILURES',
        importedCount: 1,
        rejectedCount: 1,
        items: [
          {
            kind: 'QUESTION',
            sourceIndex: 0,
            status: 'IMPORTED',
          },
          {
            kind: 'QUESTION',
            sourceIndex: 1,
            status: 'REJECTED',
            errors: [
              {
                path: 'questionTypeSlug',
                code: 'IMPORT_QUESTION_TYPE_NOT_FOUND',
              },
            ],
          },
        ],
      });
      const stored = await pool.query<{
        auditCount: string;
        itemCount: string;
        questionCount: string;
      }>(
        `select
           (select count(*) from content_import_items where import_id = c.id) as "itemCount",
           (select count(*) from questions q
             join content_import_items ci on ci.target_id = q.id
             where ci.import_id = c.id) as "questionCount",
           (select count(*) from audit_logs
             where target_id = c.id and action = 'CONTENT_IMPORT_COMPLETED') as "auditCount"
         from content_imports c
         where c.requested_by = $1 and c.idempotency_key = $2`,
        [fixture.userId, fixture.idempotencyKey],
      );
      expect(stored.rows[0]).toEqual({
        itemCount: '2',
        questionCount: '1',
        auditCount: '1',
      });
    });

    it('query projection은 requester/hash/reference map/internal IDs를 반환하지 않는다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const service = createIntegrationService(pool);
      const result = await service.execute(fixture.command);

      expect(result).not.toHaveProperty('requestedBy');
      expect(result).not.toHaveProperty('requestHash');
      expect(result.items[0]).not.toHaveProperty('id');
      expect(result.items[0]).not.toHaveProperty('importId');
      expect(result.items[0]).not.toHaveProperty('clientRef');
      expect(result.items[0]).not.toHaveProperty('referenceMap');
      expect(result.items[0]).not.toHaveProperty('createdAt');
    });
  },
);
