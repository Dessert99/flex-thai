/** 관리자 어휘 writer의 child lock·FK 삭제 순서·조건부 상태·audit transaction을 고정한다 */
import { DatabaseErrorException } from '@aws-sdk/client-rds-data';
import { randomUUID } from 'node:crypto';
import type {
  VocabularyAdminAuditInput,
  VocabularyAdminReplacementGraph,
} from '@flex-thia/domain';
import {
  VocabularyAdminError,
  VocabularyAdminService,
  type ReplaceVocabularyCommand,
} from '@flex-thia/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../schema/index.js';
import {
  auditLogs,
  vocabularies,
  vocabularyMeaningPronunciations,
  vocabularyMeanings,
  vocabularyPronunciations,
} from '../schema/index.js';
import {
  DrizzleVocabularyAdminRepository,
  translateVocabularyAdminPersistenceError,
} from './drizzle-vocabulary-admin.repository.js';

interface MutationCall {
  kind: 'delete' | 'insert' | 'update';
  table: unknown;
  values?: unknown;
}

const createFake = (
  input: {
    insertErrorTable?: unknown;
    selectResults?: Array<Array<Record<string, unknown>>>;
    updateResults?: Array<Array<Record<string, unknown>>>;
  } = {},
) => {
  const selectResults = [...(input.selectResults ?? [])];
  const updateResults = [...(input.updateResults ?? [])];
  const calls: MutationCall[] = [];
  const lockModes: unknown[] = [];
  const select = vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      for: vi.fn((mode: unknown) => {
        lockModes.push(mode);
        return chain;
      }),
      limit: vi.fn(() => Promise.resolve(selectResults.shift() ?? [])),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(selectResults.shift() ?? []).then(resolve, reject),
    };
    return chain;
  });
  const insert = vi.fn((table: unknown) => {
    const call: MutationCall = { kind: 'insert', table };
    calls.push(call);
    return {
      values: vi.fn((values: unknown) => {
        call.values = values;
        if (table === input.insertErrorTable) {
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
          where: vi.fn(() => ({
            returning: vi.fn(() =>
              Promise.resolve(updateResults.shift() ?? []),
            ),
          })),
        };
      }),
    };
  });
  const remove = vi.fn((table: unknown) => {
    const call: MutationCall = { kind: 'delete', table };
    calls.push(call);
    return { where: vi.fn(() => Promise.resolve()) };
  });
  const session = { delete: remove, insert, select, update };
  const database = {
    transaction: vi.fn(<T>(work: (transaction: typeof session) => Promise<T>) =>
      work(session),
    ),
  };
  return { calls, database, lockModes };
};

const replacement: VocabularyAdminReplacementGraph = {
  vocabulary: {
    id: 'vocabulary-id',
    thai: 'ใหม่',
    normalizedThai: 'ใหม่',
    kind: 'WORD',
    status: 'DRAFT',
    updatedAt: new Date('2026-07-24T00:00:00.000Z'),
  },
  meanings: [
    {
      id: 'meaning-new',
      vocabularyId: 'vocabulary-id',
      meaningKo: '새 뜻',
      partOfSpeech: '명사',
      difficulty: null,
      contextNote: null,
    },
  ],
  pronunciations: [
    {
      id: 'pronunciation-new',
      vocabularyId: 'vocabulary-id',
      pronunciationKo: '마이',
      toneMarks: 'F',
      mediaAssetId: 'media-id',
    },
  ],
  meaningPronunciations: [
    {
      vocabularyId: 'vocabulary-id',
      meaningId: 'meaning-new',
      pronunciationId: 'pronunciation-new',
    },
  ],
};

const audit: VocabularyAdminAuditInput = {
  actorSub: 'cognito-sub',
  actorUserId: 'actor-id',
  action: 'VOCABULARY_REPLACED',
  targetType: 'VOCABULARY',
  targetId: 'vocabulary-id',
  summary: { meaningCount: 1 },
  requestId: 'request-id',
  occurredAt: new Date('2026-07-24T00:00:00.000Z'),
};

type DataApiConstraintKind = 'foreign key' | 'unique';

interface DataApiQueryErrorOptions {
  constraint: string;
  constraintKind: DataApiConstraintKind;
  detail?: string;
  messageOverride?: string;
  sqlState: string;
  table?: string;
}

const createDataApiQueryError = ({
  constraint,
  constraintKind,
  detail = 'simulated private detail',
  messageOverride,
  sqlState,
  table = 'vocabulary_meanings',
}: DataApiQueryErrorOptions): DrizzleQueryError => {
  const header =
    constraintKind === 'unique'
      ? `ERROR: duplicate key value violates unique constraint "${constraint}"`
      : `ERROR: update or delete on table "${table}" violates foreign key constraint "${constraint}"`;
  const cause = new DatabaseErrorException({
    message:
      messageOverride ?? `${header}; Detail: ${detail}; SQLState: ${sqlState}`,
    $metadata: {},
  });
  return new DrizzleQueryError(
    'update private_vocabulary set thai = $1',
    ['private-param'],
    cause,
  );
};

describe('DrizzleVocabularyAdminRepository 잠금·전체 교체', () => {
  it('DRAFT parent와 meaning·pronunciation·mapping을 같은 순서로 FOR UPDATE 잠근다', async () => {
    const fake = createFake({
      selectResults: [
        [
          {
            id: 'vocabulary-id',
            thai: 'เดิม',
            normalizedThai: 'เดิม',
            kind: 'WORD',
            status: 'DRAFT',
          },
        ],
        [{ id: 'meaning-old' }],
        [{ id: 'pronunciation-old', mediaAssetId: 'media-id' }],
        [{ meaningId: 'meaning-old', pronunciationId: 'pronunciation-old' }],
      ],
    });
    const repository = new DrizzleVocabularyAdminRepository(
      fake.database as never,
    );

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.lockVocabularyGraph('vocabulary-id'),
      ),
    ).resolves.toEqual({
      vocabulary: {
        id: 'vocabulary-id',
        thai: 'เดิม',
        normalizedThai: 'เดิม',
        kind: 'WORD',
        status: 'DRAFT',
      },
      meanings: [{ id: 'meaning-old' }],
      pronunciations: [{ id: 'pronunciation-old', mediaAssetId: 'media-id' }],
    });
    expect(fake.lockModes).toEqual(['update', 'update', 'update', 'update']);
  });

  it('parent conditional update 뒤 mapping→pronunciation→meaning 삭제와 새 FK insert를 수행한다', async () => {
    const fake = createFake({ updateResults: [[{ id: 'vocabulary-id' }]] });
    const repository = new DrizzleVocabularyAdminRepository(
      fake.database as never,
    );

    await repository.runInTransaction((transaction) =>
      transaction.replaceVocabulary(replacement),
    );

    expect(fake.calls.map(({ kind, table }) => [kind, table])).toEqual([
      ['update', vocabularies],
      ['delete', vocabularyMeaningPronunciations],
      ['delete', vocabularyPronunciations],
      ['delete', vocabularyMeanings],
      ['insert', vocabularyMeanings],
      ['insert', vocabularyPronunciations],
      ['insert', vocabularyMeaningPronunciations],
    ]);
  });

  it('expected DRAFT/status conditional update가 사라지면 stable persistence 충돌을 던진다', async () => {
    const fake = createFake({ updateResults: [[], []] });
    const repository = new DrizzleVocabularyAdminRepository(
      fake.database as never,
    );

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.replaceVocabulary(replacement),
      ),
    ).rejects.toMatchObject({ code: 'VOCABULARY_PERSISTENCE_CONFLICT' });
    await expect(
      repository.runInTransaction((transaction) =>
        transaction.transitionVocabularyStatus({
          vocabularyId: 'vocabulary-id',
          expectedStatus: 'DRAFT',
          nextStatus: 'PUBLISHED',
          updatedAt: new Date(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'VOCABULARY_PERSISTENCE_CONFLICT' });
  });

  it('게시·복구는 게시 시각을 쓰고 숨김은 기존 게시 시각을 보존한다', async () => {
    const publishedAt = new Date('2026-07-27T00:00:00.000Z');
    const publish = createFake({ updateResults: [[{ id: 'vocabulary-id' }]] });
    const hide = createFake({ updateResults: [[{ id: 'vocabulary-id' }]] });

    await new DrizzleVocabularyAdminRepository(
      publish.database as never,
    ).runInTransaction((transaction) =>
      transaction.transitionVocabularyStatus({
        vocabularyId: 'vocabulary-id',
        expectedStatus: 'DRAFT',
        nextStatus: 'PUBLISHED',
        publishedAt,
        updatedAt: publishedAt,
      }),
    );
    await new DrizzleVocabularyAdminRepository(
      hide.database as never,
    ).runInTransaction((transaction) =>
      transaction.transitionVocabularyStatus({
        vocabularyId: 'vocabulary-id',
        expectedStatus: 'PUBLISHED',
        nextStatus: 'HIDDEN',
        publishedAt: undefined,
        updatedAt: publishedAt,
      }),
    );

    expect(publish.calls[0]?.values).toEqual({
      status: 'PUBLISHED',
      publishedAt,
      updatedAt: publishedAt,
    });
    expect(hide.calls[0]?.values).toEqual({
      status: 'HIDDEN',
      updatedAt: publishedAt,
    });
  });
});

const integrationDatabaseUrl = process.env.VOCABULARY_ADMIN_TEST_DATABASE_URL;

interface IntegrationFixture {
  actorUserId: string;
  mediaAssetId: string;
  meaningId: string;
  pronunciationId: string;
  vocabularyId: string;
}

const createIntegrationFixture = async (
  pool: Pool,
  input: {
    kind?: 'WORD' | 'EXPRESSION';
    normalizedThai?: string;
  } = {},
): Promise<IntegrationFixture> => {
  const actorUserId = randomUUID();
  const mediaAssetId = randomUUID();
  const vocabularyId = randomUUID();
  const meaningId = randomUUID();
  const pronunciationId = randomUUID();
  const normalizedThai = input.normalizedThai ?? `เดิม-${randomUUID()}`;
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status, mfa_enrolled_at)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE', now())`,
    [actorUserId, `task8-${actorUserId}`, `task8-${actorUserId}@example.com`],
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
    `insert into vocabularies (id, thai, normalized_thai, kind, status)
     values ($1, $2, $2, $3, 'DRAFT')`,
    [vocabularyId, normalizedThai, input.kind ?? 'WORD'],
  );
  await pool.query(
    `insert into vocabulary_meanings (
       id, vocabulary_id, meaning_ko, part_of_speech
     ) values ($1, $2, '기존 뜻', '명사')`,
    [meaningId, vocabularyId],
  );
  await pool.query(
    `insert into vocabulary_pronunciations (
       id, vocabulary_id, pronunciation_ko, tone_marks, media_asset_id
     ) values ($1, $2, '기존 발음', '-', $3)`,
    [pronunciationId, vocabularyId, mediaAssetId],
  );
  await pool.query(
    `insert into vocabulary_meaning_pronunciations (
       vocabulary_id, meaning_id, pronunciation_id
     ) values ($1, $2, $3)`,
    [vocabularyId, meaningId, pronunciationId],
  );
  return {
    actorUserId,
    mediaAssetId,
    meaningId,
    pronunciationId,
    vocabularyId,
  };
};

const replacementInput = (
  fixture: IntegrationFixture,
  thai: string,
): ReplaceVocabularyCommand['input'] => ({
  thai,
  kind: 'WORD',
  meanings: [
    {
      clientRef: 'meaning',
      meaningKo: '새 뜻',
      partOfSpeech: '명사',
    },
  ],
  pronunciations: [
    {
      clientRef: 'pronunciation',
      pronunciationKo: '새 발음',
      toneMarks: '-',
      mediaAssetId: fixture.mediaAssetId,
    },
  ],
  meaningPronunciations: [
    { meaningRef: 'meaning', pronunciationRef: 'pronunciation' },
  ],
});

const commandContext = (fixture: IntegrationFixture) => ({
  actorSub: `task8-${fixture.actorUserId}`,
  actorUserId: fixture.actorUserId,
  requestId: `request-${randomUUID()}`,
  occurredAt: new Date(),
});

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleVocabularyAdminRepository PostgreSQL 16 통합',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('VOCABULARY_ADMIN_TEST_DATABASE_URL_REQUIRED');
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

    it('동시 exact duplicate 교체는 하나만 commit하고 다른 하나는 stable duplicate다', async () => {
      const firstFixture = await createIntegrationFixture(pool);
      const secondFixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const first = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );
      const second = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );
      const sameThai = `ใหม่-${randomUUID()}`;

      const results = await Promise.allSettled([
        first.replace({
          vocabularyId: firstFixture.vocabularyId,
          input: replacementInput(firstFixture, sameThai),
          ...commandContext(firstFixture),
        }),
        second.replace({
          vocabularyId: secondFixture.vocabularyId,
          input: replacementInput(secondFixture, sameThai),
          ...commandContext(secondFixture),
        }),
      ]);

      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find(({ status }) => status === 'rejected');
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: { code: 'VOCABULARY_DUPLICATE' },
      });
      const stored = await pool.query<{ count: string; audits: string }>(
        `select
           (select count(*) from vocabularies where normalized_thai = $1) "count",
           (select count(*) from audit_logs
             where action = 'VOCABULARY_REPLACED'
               and summary ->> 'meaningCount' = '1') "audits"`,
        [sameThai],
      );
      expect(stored.rows[0]?.count).toBe('1');
    });

    it('서로의 normalized Thai를 동시에 swap해도 raw deadlock 없이 둘 다 stable duplicate다', async () => {
      const firstThai = `swap-alpha-${randomUUID()}`;
      const secondThai = `swap-beta-${randomUUID()}`;
      const firstFixture = await createIntegrationFixture(pool, {
        normalizedThai: firstThai,
      });
      const secondFixture = await createIntegrationFixture(pool, {
        normalizedThai: secondThai,
      });
      const database = drizzle({ client: pool, schema });
      const first = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );
      const second = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );

      const results = await Promise.allSettled([
        first.replace({
          vocabularyId: firstFixture.vocabularyId,
          input: replacementInput(firstFixture, secondThai),
          ...commandContext(firstFixture),
        }),
        second.replace({
          vocabularyId: secondFixture.vocabularyId,
          input: replacementInput(secondFixture, firstThai),
          ...commandContext(secondFixture),
        }),
      ]);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status !== 'rejected') continue;
        const reason: unknown = result.reason;
        expect(reason).toMatchObject({ code: 'VOCABULARY_DUPLICATE' });
        expect(reason).not.toMatchObject({ code: '40P01' });
      }
    });

    it('기존 child를 token이 참조하면 전체 교체와 audit을 막고 graph를 보존한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const sentenceId = randomUUID();
      const sentenceVersionId = randomUUID();
      await pool.query(`insert into thai_sentences (id) values ($1)`, [
        sentenceId,
      ]);
      await pool.query(
        `insert into thai_sentence_versions (
           id, sentence_id, version, original_text, translation_ko,
           pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, $2, 1, 'ก', '뜻', '꺼', '-', $3)`,
        [sentenceVersionId, sentenceId, fixture.mediaAssetId],
      );
      await pool.query(
        `insert into token_occurrences (
           id, sentence_version_id, position, surface, start_offset, end_offset,
           vocabulary_id, meaning_id, pronunciation_id, context_meaning_ko, role
         ) values ($1, $2, 0, 'ก', 0, 1, $3, $4, $5, '뜻', 'TARGET')`,
        [
          randomUUID(),
          sentenceVersionId,
          fixture.vocabularyId,
          fixture.meaningId,
          fixture.pronunciationId,
        ],
      );
      const database = drizzle({ client: pool, schema });
      const service = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );

      await expect(
        service.replace({
          vocabularyId: fixture.vocabularyId,
          input: replacementInput(fixture, `차단-${randomUUID()}`),
          ...commandContext(fixture),
        }),
      ).rejects.toEqual(new VocabularyAdminError('VOCABULARY_IN_USE'));
      const stored = await pool.query<{
        audits: string;
        meanings: string;
        pronunciations: string;
      }>(
        `select
           (select count(*) from vocabulary_meanings
             where vocabulary_id = $1) "meanings",
           (select count(*) from vocabulary_pronunciations
             where vocabulary_id = $1) "pronunciations",
           (select count(*) from audit_logs
             where target_id = $1 and action = 'VOCABULARY_REPLACED') "audits"`,
        [fixture.vocabularyId],
      );
      expect(stored.rows[0]).toEqual({
        meanings: '1',
        pronunciations: '1',
        audits: '0',
      });
    });

    it('expression occurrence만 기존 어휘를 참조해도 전체 교체를 막는다', async () => {
      const fixture = await createIntegrationFixture(pool, {
        kind: 'EXPRESSION',
      });
      const sentenceId = randomUUID();
      const sentenceVersionId = randomUUID();
      await pool.query(`insert into thai_sentences (id) values ($1)`, [
        sentenceId,
      ]);
      await pool.query(
        `insert into thai_sentence_versions (
           id, sentence_id, version, original_text, translation_ko,
           pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, $2, 1, 'กข', '뜻', '꺼커', '--', $3)`,
        [sentenceVersionId, sentenceId, fixture.mediaAssetId],
      );
      await pool.query(
        `insert into expression_occurrences (
           id, sentence_version_id, start_token_index, end_token_index,
           vocabulary_id, vocabulary_kind, meaning_id, pronunciation_id,
           context_meaning_ko, representative
         ) values ($1, $2, 0, 2, $3, 'EXPRESSION', $4, $5, '기존 뜻', true)`,
        [
          randomUUID(),
          sentenceVersionId,
          fixture.vocabularyId,
          fixture.meaningId,
          fixture.pronunciationId,
        ],
      );
      const service = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(drizzle({ client: pool, schema })),
      );

      await expect(
        service.replace({
          vocabularyId: fixture.vocabularyId,
          input: replacementInput(fixture, `표현차단-${randomUUID()}`),
          ...commandContext(fixture),
        }),
      ).rejects.toEqual(new VocabularyAdminError('VOCABULARY_IN_USE'));
    });

    it('동시 question token save가 child key share를 먼저 잡으면 replace는 commit 뒤 stable in-use다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const sentenceId = randomUUID();
      const sentenceVersionId = randomUUID();
      await pool.query(`insert into thai_sentences (id) values ($1)`, [
        sentenceId,
      ]);
      await pool.query(
        `insert into thai_sentence_versions (
           id, sentence_id, version, original_text, translation_ko,
           pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, $2, 1, 'ก', '뜻', '꺼', '-', $3)`,
        [sentenceVersionId, sentenceId, fixture.mediaAssetId],
      );
      const saveClient = await pool.connect();
      try {
        await saveClient.query('begin');
        await saveClient.query(
          `select id from vocabularies where id = $1 for key share`,
          [fixture.vocabularyId],
        );
        await saveClient.query(
          `select id from vocabulary_meanings where id = $1 for key share`,
          [fixture.meaningId],
        );
        await saveClient.query(
          `select id from vocabulary_pronunciations
            where id = $1 for key share`,
          [fixture.pronunciationId],
        );
        await saveClient.query(
          `insert into token_occurrences (
             id, sentence_version_id, position, surface, start_offset,
             end_offset, vocabulary_id, meaning_id, pronunciation_id,
             context_meaning_ko, role
           ) values ($1, $2, 0, 'ก', 0, 1, $3, $4, $5, '뜻', 'TARGET')`,
          [
            randomUUID(),
            sentenceVersionId,
            fixture.vocabularyId,
            fixture.meaningId,
            fixture.pronunciationId,
          ],
        );
        const service = new VocabularyAdminService(
          new DrizzleVocabularyAdminRepository(
            drizzle({ client: pool, schema }),
          ),
        );
        let settled = false;
        const replacing = service.replace({
          vocabularyId: fixture.vocabularyId,
          input: replacementInput(fixture, `동시저장-${randomUUID()}`),
          ...commandContext(fixture),
        });
        void replacing.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(settled).toBe(false);
        await saveClient.query('commit');

        await expect(replacing).rejects.toEqual(
          new VocabularyAdminError('VOCABULARY_IN_USE'),
        );
      } finally {
        await saveClient.query('rollback').catch(() => undefined);
        saveClient.release();
      }
    });

    it('동시 publish·hide·restore는 단계마다 exact 한 전이와 audit만 commit한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const first = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );
      const second = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );
      for (const method of ['publish', 'hide', 'restore'] as const) {
        const results = await Promise.allSettled([
          first[method]({
            vocabularyId: fixture.vocabularyId,
            ...commandContext(fixture),
          }),
          second[method]({
            vocabularyId: fixture.vocabularyId,
            ...commandContext(fixture),
          }),
        ]);
        expect(
          results.filter(({ status }) => status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
          results.find(({ status }) => status === 'rejected'),
        ).toMatchObject({
          status: 'rejected',
          reason: { code: 'VOCABULARY_STATE_CONFLICT' },
        });
      }
      const stored = await pool.query<{ audits: string; status: string }>(
        `select status,
           (select count(*) from audit_logs
             where target_id = vocabularies.id
               and action in (
                 'VOCABULARY_PUBLISHED',
                 'VOCABULARY_HIDDEN',
                 'VOCABULARY_RESTORED'
               )) "audits"
         from vocabularies where id = $1`,
        [fixture.vocabularyId],
      );
      expect(stored.rows[0]).toEqual({ status: 'PUBLISHED', audits: '3' });
    });

    it('audit FK 실패는 앞선 publish update까지 transaction 전체를 rollback한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const service = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );

      await expect(
        service.publish({
          vocabularyId: fixture.vocabularyId,
          actorSub: 'missing-actor-sub',
          actorUserId: randomUUID(),
          requestId: `request-${randomUUID()}`,
          occurredAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: 'VOCABULARY_STATE_CONFLICT' });
      const stored = await pool.query<{ audits: string; status: string }>(
        `select status,
           (select count(*) from audit_logs where target_id = vocabularies.id)
             "audits"
         from vocabularies where id = $1`,
        [fixture.vocabularyId],
      );
      expect(stored.rows[0]).toEqual({ status: 'DRAFT', audits: '0' });
    });

    it('replace audit FK 실패는 parent와 기존 child 전체 교체를 rollback한다', async () => {
      const fixture = await createIntegrationFixture(pool);
      const database = drizzle({ client: pool, schema });
      const service = new VocabularyAdminService(
        new DrizzleVocabularyAdminRepository(database),
      );

      await expect(
        service.replace({
          vocabularyId: fixture.vocabularyId,
          input: replacementInput(fixture, `롤백-${randomUUID()}`),
          actorSub: 'missing-actor-sub',
          actorUserId: randomUUID(),
          requestId: `request-${randomUUID()}`,
          occurredAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: 'VOCABULARY_STATE_CONFLICT' });
      const stored = await pool.query<{
        auditCount: string;
        meaningId: string;
        pronunciationId: string;
      }>(
        `select
           vm.id "meaningId",
           vp.id "pronunciationId",
           (select count(*) from audit_logs where target_id = v.id)
             "auditCount"
         from vocabularies v
         join vocabulary_meanings vm on vm.vocabulary_id = v.id
         join vocabulary_pronunciations vp on vp.vocabulary_id = v.id
         where v.id = $1`,
        [fixture.vocabularyId],
      );
      expect(stored.rows[0]).toEqual({
        meaningId: fixture.meaningId,
        pronunciationId: fixture.pronunciationId,
        auditCount: '0',
      });
    });
  },
);

describe('DrizzleVocabularyAdminRepository 감사·오류 안정화', () => {
  it('구조화 감사와 occurredAt을 같은 transaction insert에 전달한다', async () => {
    const fake = createFake();
    const repository = new DrizzleVocabularyAdminRepository(
      fake.database as never,
    );

    await repository.runInTransaction((transaction) =>
      transaction.appendAuditLog(audit),
    );

    expect(fake.calls).toEqual([
      {
        kind: 'insert',
        table: auditLogs,
        values: {
          actorSub: 'cognito-sub',
          actorUserId: 'actor-id',
          action: 'VOCABULARY_REPLACED',
          target: 'vocabulary-id',
          targetType: 'VOCABULARY',
          targetId: 'vocabulary-id',
          summary: { meaningCount: 1 },
          requestId: 'request-id',
          createdAt: audit.occurredAt,
        },
      },
    ]);
  });

  it('audit insert 실패를 삼키지 않아 transaction rollback을 가능하게 한다', async () => {
    const fake = createFake({ insertErrorTable: auditLogs });
    const repository = new DrizzleVocabularyAdminRepository(
      fake.database as never,
    );

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.appendAuditLog(audit),
      ),
    ).rejects.toThrow('insert-fail');
  });

  it.each([
    {
      error: {
        code: '23505',
        constraint: 'vocabularies_normalized_thai_unique',
      },
      code: 'VOCABULARY_DUPLICATE',
    },
    {
      error: {
        code: '23503',
        constraint: 'token_occurrences_meaning_vocabulary_fk',
      },
      code: 'VOCABULARY_IN_USE',
    },
  ])('$code local pg 제약을 stable 오류로 바꾼다', ({ error, code }) => {
    expect(() =>
      translateVocabularyAdminPersistenceError(error, 'replaceVocabulary'),
    ).toThrow(expect.objectContaining({ code }));
  });

  it.each([
    {
      error: createDataApiQueryError({
        constraint: 'vocabularies_normalized_thai_unique',
        constraintKind: 'unique',
        sqlState: '23505',
      }),
      code: 'VOCABULARY_DUPLICATE',
    },
    {
      error: createDataApiQueryError({
        constraint: 'token_occurrences_meaning_vocabulary_fk',
        constraintKind: 'foreign key',
        sqlState: '23503',
      }),
      code: 'VOCABULARY_IN_USE',
    },
  ])(
    '$code 실제 Data API·Drizzle wrapper 제약을 stable 오류로 바꾼다',
    ({ error, code }) => {
      expect(() =>
        translateVocabularyAdminPersistenceError(error, 'replaceVocabulary'),
      ).toThrow(expect.objectContaining({ code }));
    },
  );

  it.each([
    {
      label: 'header prefix 위조',
      message:
        'ERROR: private prefix duplicate key value violates unique constraint "vocabularies_normalized_thai_unique"; SQLState: 23505',
    },
    {
      label: 'header suffix 위조',
      message:
        'ERROR: duplicate key value violates unique constraint "vocabularies_normalized_thai_unique" private suffix; SQLState: 23505',
    },
    {
      label: 'Detail known constraint 위조',
      message:
        'ERROR: duplicate key value violates unique constraint "unknown_private_unique"; Detail: violates unique constraint "vocabularies_normalized_thai_unique"; SQLState: 23505',
    },
    {
      label: 'Hint known constraint 위조',
      message:
        'ERROR: duplicate key value violates unique constraint "unknown_private_unique"; Hint: violates unique constraint "vocabularies_normalized_thai_unique"; SQLState: 23505',
    },
    {
      label: 'constraint kind 불일치',
      message:
        'ERROR: update or delete on table "vocabulary_meanings" violates foreign key constraint "vocabularies_normalized_thai_unique"; SQLState: 23505',
    },
    {
      label: 'SQLSTATE 불일치',
      message:
        'ERROR: duplicate key value violates unique constraint "vocabularies_normalized_thai_unique"; SQLState: 23503',
    },
    {
      label: 'unknown constraint',
      message:
        'ERROR: duplicate key value violates unique constraint "unknown_private_unique"; SQLState: 23505',
    },
  ])(
    '$label Data API message는 generic non-leaking 오류로 감춘다',
    ({ message }) => {
      const error = createDataApiQueryError({
        constraint: 'unused',
        constraintKind: 'unique',
        messageOverride: message,
        sqlState: '23505',
      });

      const failure = (() => {
        try {
          translateVocabularyAdminPersistenceError(error, 'replaceVocabulary');
        } catch (caught) {
          return caught;
        }
      })();

      expect(failure).toMatchObject({
        code: 'VOCABULARY_PERSISTENCE_CONFLICT',
        operation: 'replaceVocabulary',
        message: 'VOCABULARY_PERSISTENCE_CONFLICT:replaceVocabulary',
      });
      expect(String(failure)).not.toContain('private_vocabulary');
      expect(String(failure)).not.toContain('private-param');
      expect(String(failure)).not.toContain('unknown_private_unique');
      expect(String(failure)).not.toContain(
        'vocabularies_normalized_thai_unique',
      );
    },
  );
});
