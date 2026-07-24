/** 관리자 문제 Drizzle writer의 lock·graph 교체·감사 transaction을 검증한다 */
import { randomUUID } from 'node:crypto';
import {
  QuestionAdminError,
  QuestionAdminService,
  QuestionPublicationService,
  type ReplaceQuestionVersionCommand,
} from '@flex-thia/domain';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { QuestionAdminVersionGraph } from '@flex-thia/domain';
import * as schema from '../schema/index.js';
import {
  auditLogs,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questionVersions,
  thaiSentences,
  thaiSentenceVersions,
} from '../schema/index.js';
import {
  DrizzleQuestionAdminRepository,
  QuestionAdminPersistenceError,
} from './drizzle-question-admin.repository.js';
import { DrizzleQuestionPublicationRepository } from './drizzle-question-publication.repository.js';

type QueryResult = Array<Record<string, unknown>>;

interface MutationCall {
  kind: 'insert' | 'update' | 'delete';
  table: unknown;
  values?: unknown;
  condition?: unknown;
}

const toSql = (value: unknown) => new PgDialect().sqlToQuery(value as never);

const createFake = (input?: {
  selectResults?: QueryResult[];
  updateResults?: QueryResult[];
  insertErrorTable?: unknown;
}) => {
  const selectResults = [...(input?.selectResults ?? [])];
  const updateResults = [...(input?.updateResults ?? [])];
  const calls: MutationCall[] = [];
  const lockModes: unknown[] = [];
  const select = vi.fn(() => {
    const consume = () => selectResults.shift() ?? [];
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      for: vi.fn((mode: unknown) => {
        lockModes.push(mode);
        return chain;
      }),
      limit: vi.fn(() => Promise.resolve(consume())),
      then: (
        resolve: (value: QueryResult) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(consume()).then(resolve, reject),
    };
    return chain;
  });
  const insert = vi.fn((table: unknown) => {
    const call: MutationCall = { kind: 'insert', table };
    calls.push(call);
    return {
      values: vi.fn((values: unknown) => {
        call.values = values;
        if (table === input?.insertErrorTable) {
          return Promise.reject(new Error('insert-fail'));
        }
        return Promise.resolve();
      }),
    };
  });
  const update = vi.fn((table: unknown) => {
    const call: MutationCall = { kind: 'update', table };
    calls.push(call);
    return {
      set: vi.fn((values: unknown) => {
        call.values = values;
        return {
          where: vi.fn((condition: unknown) => {
            call.condition = condition;
            return {
              returning: vi.fn(() =>
                Promise.resolve(updateResults.shift() ?? []),
              ),
            };
          }),
        };
      }),
    };
  });
  const remove = vi.fn((table: unknown) => {
    const call: MutationCall = { kind: 'delete', table };
    calls.push(call);
    return {
      where: vi.fn((condition: unknown) => {
        call.condition = condition;
        return Promise.resolve();
      }),
    };
  });
  const session = { delete: remove, insert, select, update };
  const database = {
    transaction: vi.fn(<T>(work: (transaction: typeof session) => Promise<T>) =>
      work(session),
    ),
  };
  return { calls, database, lockModes };
};

const graph = (): QuestionAdminVersionGraph => ({
  version: {
    id: 'version-id',
    questionId: 'question-id',
    version: 2,
    typeVersionId: 'type-version-id',
    difficulty: 3,
    status: 'DRAFT',
    validationStatus: 'PENDING',
    validationIssues: [],
    validatedAt: null,
    publishedAt: null,
  },
  sentences: [
    {
      sentence: { id: 'sentence-id' },
      version: {
        id: 'sentence-version-id',
        sentenceId: 'sentence-id',
        version: 1,
        originalText: 'ก',
        translationKo: '뜻',
        pronunciationKo: '꺼',
        toneMarks: '-',
        mediaAssetId: 'media-id',
        frozenAt: null,
      },
      tokens: [],
      expressions: [],
    },
  ],
  blocks: [
    {
      id: 'block-id',
      questionVersionId: 'version-id',
      kind: 'QUESTION',
      displayMode: 'TEXT',
      position: 0,
      sentences: [
        {
          id: 'block-sentence-id',
          blockId: 'block-id',
          sentenceVersionId: 'sentence-version-id',
          position: 0,
          speaker: null,
        },
      ],
    },
  ],
  options: [
    {
      id: 'option-id',
      questionVersionId: 'version-id',
      sentenceVersionId: 'sentence-version-id',
      position: 0,
      isCorrect: true,
    },
  ],
});

describe('DrizzleQuestionAdminRepository 문제 버전 graph', () => {
  it('버전을 row lock으로 읽고 block·sentence ref·option 순서를 복원한다', async () => {
    const fake = createFake({
      selectResults: [
        [
          {
            id: 'version-id',
            questionId: 'question-id',
            version: 2,
            typeVersionId: 'type-version-id',
            difficulty: 3,
            status: 'DRAFT',
            validationStatus: 'FAILED',
            publishedAt: null,
          },
        ],
        [
          {
            id: 'block-id',
            kind: 'QUESTION',
            displayMode: 'TEXT',
            position: 0,
          },
        ],
        [
          {
            blockId: 'block-id',
            sentenceVersionId: 'sentence-version-id',
            position: 0,
            speaker: null,
          },
        ],
        [
          {
            sentenceVersionId: 'option-sentence-id',
            position: 0,
            isCorrect: true,
          },
        ],
      ],
    });
    const repository = new DrizzleQuestionAdminRepository(
      fake.database as never,
    );

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.loadVersionSource('version-id'),
      ),
    ).resolves.toMatchObject({
      id: 'version-id',
      status: 'DRAFT',
      blocks: [
        {
          sentences: [{ sentenceVersionId: 'sentence-version-id' }],
        },
      ],
      options: [{ sentenceVersionId: 'option-sentence-id', isCorrect: true }],
    });
    expect(fake.lockModes).toEqual(['update']);
  });

  it('clone graph는 sentence row를 복제하지 않고 새 version·연결만 삽입한다', async () => {
    const fake = createFake();
    const repository = new DrizzleQuestionAdminRepository(
      fake.database as never,
    );
    const cloned = graph();
    cloned.sentences = [];

    await repository.runInTransaction((transaction) =>
      transaction.createVersion(cloned),
    );

    expect(fake.calls.map(({ table }) => table)).toEqual([
      questionVersions,
      questionBlocks,
      questionBlockSentences,
      questionOptions,
    ]);
    expect(fake.calls.map(({ table }) => table)).not.toContain(thaiSentences);
    expect(fake.calls.map(({ table }) => table)).not.toContain(
      thaiSentenceVersions,
    );
  });

  it('교체는 DRAFT 조건 update 뒤 old 연결만 지우고 새 sentence graph를 삽입한다', async () => {
    const fake = createFake({
      selectResults: [[{ id: 'old-block-id' }]],
      updateResults: [[{ id: 'version-id' }]],
    });
    const repository = new DrizzleQuestionAdminRepository(
      fake.database as never,
    );

    await repository.runInTransaction((transaction) =>
      transaction.replaceVersion(graph()),
    );

    expect(fake.calls[0]).toMatchObject({
      kind: 'update',
      table: questionVersions,
      values: {
        typeVersionId: 'type-version-id',
        difficulty: 3,
        validationStatus: 'PENDING',
        validationIssues: [],
        validatedAt: null,
        publishedAt: null,
      },
    });
    expect(toSql(fake.calls[0]?.condition).params).toEqual(
      expect.arrayContaining(['version-id', 'DRAFT']),
    );
    expect(fake.calls.slice(1, 4).map(({ table }) => table)).toEqual([
      questionBlockSentences,
      questionBlocks,
      questionOptions,
    ]);
    expect(fake.calls.map(({ table }) => table)).toEqual(
      expect.arrayContaining([
        thaiSentences,
        thaiSentenceVersions,
        questionBlocks,
        questionOptions,
      ]),
    );
    expect(
      fake.calls.filter(
        ({ kind, table }) =>
          kind === 'delete' &&
          (table === thaiSentences || table === thaiSentenceVersions),
      ),
    ).toEqual([]);
  });

  it('DRAFT 조건 update가 사라지면 stable persistence 충돌을 던진다', async () => {
    const fake = createFake({ updateResults: [[]] });
    const repository = new DrizzleQuestionAdminRepository(
      fake.database as never,
    );

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.replaceVersion(graph()),
      ),
    ).rejects.toBeInstanceOf(QuestionAdminPersistenceError);
    expect(fake.calls).toHaveLength(1);
  });
});

describe('DrizzleQuestionAdminRepository 감사 원자성', () => {
  it('구조화 감사와 occurredAt을 같은 transaction insert에 전달한다', async () => {
    const fake = createFake();
    const repository = new DrizzleQuestionAdminRepository(
      fake.database as never,
    );

    await repository.runInTransaction((transaction) =>
      transaction.appendAuditLog({
        actorSub: 'cognito-sub',
        actorUserId: 'actor-id',
        action: 'QUESTION_VERSION_REPLACED',
        targetType: 'QUESTION_VERSION',
        targetId: 'version-id',
        summary: { questionId: 'question-id' },
        requestId: 'request-id',
        occurredAt: new Date('2026-07-24T00:00:00.000Z'),
      }),
    );

    expect(fake.calls).toEqual([
      {
        kind: 'insert',
        table: auditLogs,
        values: {
          actorSub: 'cognito-sub',
          actorUserId: 'actor-id',
          action: 'QUESTION_VERSION_REPLACED',
          target: 'version-id',
          targetType: 'QUESTION_VERSION',
          targetId: 'version-id',
          summary: { questionId: 'question-id' },
          requestId: 'request-id',
          createdAt: new Date('2026-07-24T00:00:00.000Z'),
        },
      },
    ]);
  });

  it('audit insert 실패를 삼키지 않아 writer transaction을 rollback 가능하게 한다', async () => {
    const fake = createFake({ insertErrorTable: auditLogs });
    const repository = new DrizzleQuestionAdminRepository(
      fake.database as never,
    );

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.appendAuditLog({
          actorSub: 'cognito-sub',
          actorUserId: 'actor-id',
          action: 'QUESTION_VERSION_CLONED',
          targetType: 'QUESTION_VERSION',
          targetId: 'version-id',
          summary: {},
          requestId: 'request-id',
          occurredAt: new Date(),
        }),
      ),
    ).rejects.toThrow('insert-fail');
  });
});

const integrationDatabaseUrl =
  process.env.QUESTION_ADMIN_REPOSITORY_TEST_DATABASE_URL;

interface IntegrationFixture {
  actorUserId: string;
  mediaAssetId: string;
  questionId: string;
  publishedVersionId: string;
  typeSlug: string;
}

const createIntegrationFixture = async (
  pool: Pool,
): Promise<IntegrationFixture> => {
  const actorUserId = randomUUID();
  const mediaAssetId = randomUUID();
  const questionTypeId = randomUUID();
  const typeVersionId = randomUUID();
  const questionId = randomUUID();
  const publishedVersionId = randomUUID();
  const typeSlug = `task7-${randomUUID()}`;
  await pool.query(
    `insert into users (
       id, cognito_sub, email, role, status, mfa_enrolled_at
     ) values ($1, $2, $3, 'ADMIN', 'ACTIVE', now())`,
    [actorUserId, `task7-${actorUserId}`, `task7-${actorUserId}@example.com`],
  );
  await pool.query(
    `insert into media_assets (
       id, kind, storage_key, declared_mime_type, declared_size_bytes,
       declared_sha256, mime_type, size_bytes, sha256, status, ready_at
     ) values (
       $1, 'AUDIO', $2, 'audio/mpeg', 1, $3,
       'audio/mpeg', 1, $3, 'READY', now()
     )`,
    [mediaAssetId, `audio/${mediaAssetId}`, 'a'.repeat(64)],
  );
  await pool.query(
    `insert into question_types (id, slug, display_name, skill)
     values ($1, $2, 'Task 7', 'READING')`,
    [questionTypeId, typeSlug],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 2, '{}'::jsonb)`,
    [typeVersionId, questionTypeId],
  );
  await pool.query(
    `insert into questions (id, status)
     values ($1, 'DRAFT')`,
    [questionId],
  );
  await pool.query(
    `insert into question_versions (
       id, question_id, version, type_version_id, difficulty, status,
       validation_status, validation_issues, validated_at, published_at
     ) values (
       $1, $2, 1, $3, 2, 'PUBLISHED',
       'PASSED', '[]'::jsonb, now(), now()
     )`,
    [publishedVersionId, questionId, typeVersionId],
  );
  const sentenceVersionIds: string[] = [];
  for (const [index, originalText] of ['ก', 'ข', 'ค'].entries()) {
    const sentenceId = randomUUID();
    const sentenceVersionId = randomUUID();
    sentenceVersionIds.push(sentenceVersionId);
    await pool.query(`insert into thai_sentences (id) values ($1)`, [
      sentenceId,
    ]);
    await pool.query(
      `insert into thai_sentence_versions (
         id, sentence_id, version, original_text, translation_ko,
         pronunciation_ko, tone_marks, media_asset_id, frozen_at
       ) values ($1, $2, 1, $3, $4, $4, '-', $5, now())`,
      [
        sentenceVersionId,
        sentenceId,
        originalText,
        `문장 ${index}`,
        mediaAssetId,
      ],
    );
  }
  const blockId = randomUUID();
  await pool.query(
    `insert into question_blocks (
       id, question_version_id, kind, display_mode, position
     ) values ($1, $2, 'QUESTION', 'TEXT', 0)`,
    [blockId, publishedVersionId],
  );
  await pool.query(
    `insert into question_block_sentences (
       id, block_id, sentence_version_id, position
     ) values ($1, $2, $3, 0)`,
    [randomUUID(), blockId, sentenceVersionIds[0]],
  );
  await pool.query(
    `insert into question_options (
       id, question_version_id, sentence_version_id, position, is_correct
     ) values
       ($1, $2, $3, 0, true),
       ($4, $2, $5, 1, false)`,
    [
      randomUUID(),
      publishedVersionId,
      sentenceVersionIds[1],
      randomUUID(),
      sentenceVersionIds[2],
    ],
  );
  await pool.query(
    `update questions
        set status = 'PUBLISHED', current_published_version_id = $2
      where id = $1`,
    [questionId, publishedVersionId],
  );
  return {
    actorUserId,
    mediaAssetId,
    questionId,
    publishedVersionId,
    typeSlug,
  };
};

const replacementInput = (
  fixture: IntegrationFixture,
  optionCount = 2,
): ReplaceQuestionVersionCommand['input'] => {
  const sentence = (originalText: string) => ({
    originalText,
    translationKo: `뜻 ${originalText}`,
    pronunciationKo: `발음 ${originalText}`,
    toneMarks: '-',
    mediaAssetId: fixture.mediaAssetId,
    tokens: [],
    expressions: [],
  });
  return {
    questionTypeSlug: fixture.typeSlug,
    questionTypeVersion: 1,
    difficulty: 4,
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        sentences: [{ sentence: sentence('ง') }],
      },
    ],
    options: Array.from({ length: optionCount }, (_, position) => ({
      clientRef: `option-${position}`,
      position,
      sentence: sentence(position === 0 ? 'จ' : 'ฉ'),
    })),
    correctOptionRef: 'option-0',
  };
};

const commandContext = (fixture: IntegrationFixture) => ({
  actorSub: `task7-${fixture.actorUserId}`,
  actorUserId: fixture.actorUserId,
  requestId: `request-${randomUUID()}`,
  occurredAt: new Date(),
});

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleQuestionAdminRepository PostgreSQL 16 통합',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('QUESTION_ADMIN_REPOSITORY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      const version = await pool.query<{ serverVersionNum: string }>(
        `select current_setting('server_version_num') "serverVersionNum"`,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeGreaterThanOrEqual(
        160000,
      );
      expect(Number(version.rows[0]?.serverVersionNum)).toBeLessThan(170000);
    });

    afterAll(async () => {
      await pool.end();
    });

    it('동시 clone은 question lock 뒤 중복 없는 다음 version과 sentence ref를 저장한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const first = new QuestionAdminService(
        new DrizzleQuestionAdminRepository(database),
      );
      const second = new QuestionAdminService(
        new DrizzleQuestionAdminRepository(database),
      );

      const results = await Promise.all([
        first.cloneVersion({
          questionId: fixture.questionId,
          ...commandContext(fixture),
        }),
        second.cloneVersion({
          questionId: fixture.questionId,
          ...commandContext(fixture),
        }),
      ]);

      expect(results.map(({ version }) => version).sort()).toEqual([2, 3]);
      const stored = await pool.query<{
        audits: string;
        distinctVersions: string;
        sentenceRefs: string;
        versions: string;
      }>(
        `select
           (select count(*) from question_versions
             where question_id = $1) "versions",
           (select count(distinct version) from question_versions
             where question_id = $1) "distinctVersions",
           (select count(*) from audit_logs
             where action = 'QUESTION_VERSION_CLONED'
               and summary ->> 'questionId' = $1::text) "audits",
           (select count(*) from (
              select qbs.sentence_version_id
                from question_block_sentences qbs
                join question_blocks qb on qb.id = qbs.block_id
                join question_versions qv on qv.id = qb.question_version_id
               where qv.question_id = $1 and qv.version > 1
              union all
              select qo.sentence_version_id
                from question_options qo
                join question_versions qv on qv.id = qo.question_version_id
               where qv.question_id = $1 and qv.version > 1
            ) refs) "sentenceRefs"`,
        [fixture.questionId],
      );
      expect(stored.rows[0]).toEqual({
        versions: '3',
        distinctVersions: '3',
        audits: '2',
        sentenceRefs: '6',
      });
    });

    it('immutable replace를 거절하고 DRAFT 교체·FAILED 검증 보고서를 원자 저장한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const admin = new QuestionAdminService(
        new DrizzleQuestionAdminRepository(database),
      );
      await expect(
        admin.replaceVersion({
          versionId: fixture.publishedVersionId,
          input: replacementInput(fixture),
          ...commandContext(fixture),
        }),
      ).rejects.toEqual(new QuestionAdminError('IMMUTABLE_VERSION'));
      const draft = await admin.cloneVersion({
        questionId: fixture.questionId,
        ...commandContext(fixture),
      });

      await admin.replaceVersion({
        versionId: draft.versionId,
        input: replacementInput(fixture, 1),
        ...commandContext(fixture),
      });
      const publication = new QuestionPublicationService(
        new DrizzleQuestionPublicationRepository(database),
      );
      const report = await publication.validateVersion({
        versionId: draft.versionId,
        ...commandContext(fixture),
      });

      expect(report).toEqual({
        status: 'FAILED',
        issues: [{ path: 'options', code: 'OPTION_COUNT_INVALID' }],
      });
      const stored = await pool.query<{
        auditCount: string;
        issueCount: number;
        status: string;
        validatedAt: Date | null;
      }>(
        `select
           qv.validation_status "status",
           jsonb_array_length(qv.validation_issues) "issueCount",
           qv.validated_at "validatedAt",
           (select count(*) from audit_logs
             where target_id = qv.id
               and action in (
                 'QUESTION_VERSION_REPLACED',
                 'QUESTION_VERSION_VALIDATED'
               )) "auditCount"
         from question_versions qv
         where qv.id = $1`,
        [draft.versionId],
      );
      expect(stored.rows[0]).toMatchObject({
        status: 'FAILED',
        issueCount: 1,
        auditCount: '2',
      });
      expect(stored.rows[0]?.validatedAt).toBeInstanceOf(Date);
    });

    it('게시용 최신 검증 실패는 검증 결과와 감사를 포함한 transaction 전체를 rollback한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const admin = new QuestionAdminService(
        new DrizzleQuestionAdminRepository(database),
      );
      const draft = await admin.cloneVersion({
        questionId: fixture.questionId,
        ...commandContext(fixture),
      });
      await admin.replaceVersion({
        versionId: draft.versionId,
        input: replacementInput(fixture, 1),
        ...commandContext(fixture),
      });
      const publication = new QuestionPublicationService(
        new DrizzleQuestionPublicationRepository(database),
      );

      await expect(
        publication.publishVersion({
          questionId: fixture.questionId,
          versionId: draft.versionId,
          ...commandContext(fixture),
        }),
      ).rejects.toMatchObject({
        code: 'QUESTION_VERSION_NOT_PUBLISHABLE',
      });

      const stored = await pool.query<{
        currentPublishedVersionId: string;
        draftIssues: unknown[];
        draftPublishedAt: Date | null;
        draftStatus: string;
        draftValidatedAt: Date | null;
        draftValidationStatus: string;
        publishAuditCount: string;
        validationAuditCount: string;
      }>(
        `select
           q.current_published_version_id "currentPublishedVersionId",
           draft.status "draftStatus",
           draft.validation_status "draftValidationStatus",
           draft.validation_issues "draftIssues",
           draft.validated_at "draftValidatedAt",
           draft.published_at "draftPublishedAt",
           (select count(*) from audit_logs
             where target_id = draft.id
               and action = 'QUESTION_VERSION_PUBLISHED') "publishAuditCount",
           (select count(*) from audit_logs
             where target_id = draft.id
               and action = 'QUESTION_VERSION_VALIDATED') "validationAuditCount"
         from questions q
         join question_versions draft on draft.id = $2
         where q.id = $1`,
        [fixture.questionId, draft.versionId],
      );
      expect(stored.rows[0]).toEqual({
        currentPublishedVersionId: fixture.publishedVersionId,
        draftStatus: 'DRAFT',
        draftValidationStatus: 'PENDING',
        draftIssues: [],
        draftValidatedAt: null,
        draftPublishedAt: null,
        publishAuditCount: '0',
        validationAuditCount: '0',
      });
    });

    it('새 버전 publish는 이전 버전을 retire하고 invalidate는 문제를 숨긴다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const admin = new QuestionAdminService(
        new DrizzleQuestionAdminRepository(database),
      );
      const draft = await admin.cloneVersion({
        questionId: fixture.questionId,
        ...commandContext(fixture),
      });
      const publication = new QuestionPublicationService(
        new DrizzleQuestionPublicationRepository(database),
      );

      await publication.publishVersion({
        questionId: fixture.questionId,
        versionId: draft.versionId,
        ...commandContext(fixture),
      });
      let states = await pool.query<{
        currentPublishedVersionId: string;
        draftStatus: string;
        oldStatus: string;
        questionStatus: string;
      }>(
        `select
           q.status "questionStatus",
           q.current_published_version_id "currentPublishedVersionId",
           old.status "oldStatus",
           draft.status "draftStatus"
         from questions q
         join question_versions old on old.id = $2
         join question_versions draft on draft.id = $3
         where q.id = $1`,
        [fixture.questionId, fixture.publishedVersionId, draft.versionId],
      );
      expect(states.rows[0]).toEqual({
        questionStatus: 'PUBLISHED',
        currentPublishedVersionId: draft.versionId,
        oldStatus: 'RETIRED',
        draftStatus: 'PUBLISHED',
      });

      await publication.invalidateVersion({
        questionId: fixture.questionId,
        versionId: draft.versionId,
        ...commandContext(fixture),
      });
      states = await pool.query(
        `select q.status "questionStatus", qv.status "draftStatus"
           from questions q
           join question_versions qv on qv.id = $2
          where q.id = $1`,
        [fixture.questionId, draft.versionId],
      );
      expect(states.rows[0]).toMatchObject({
        questionStatus: 'HIDDEN',
        draftStatus: 'INVALIDATED',
      });
    });

    it('audit FK 실패는 clone graph 전체를 rollback한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const admin = new QuestionAdminService(
        new DrizzleQuestionAdminRepository(database),
      );

      await expect(
        admin.cloneVersion({
          questionId: fixture.questionId,
          actorSub: 'missing-actor-sub',
          actorUserId: randomUUID(),
          requestId: `request-${randomUUID()}`,
          occurredAt: new Date(),
        }),
      ).rejects.toThrow();
      const stored = await pool.query<{ count: string }>(
        `select count(*) from question_versions where question_id = $1`,
        [fixture.questionId],
      );
      expect(stored.rows[0]?.count).toBe('1');
    });
  },
);
