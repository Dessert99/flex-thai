/** 관리자 어휘 list/detail의 정규화 검색·stable order·안전한 projection을 고정한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../schema/index.js';
import {
  mediaAssets,
  vocabularies,
  vocabularyPronunciations,
} from '../schema/index.js';
import { DrizzleAdminVocabularyQuery } from './drizzle-admin-vocabulary.query.js';

const createSelectFake = (results: Array<Array<Record<string, unknown>>>) => {
  const queue = [...results];
  const calls: Array<{
    fields: Record<string, unknown>;
    table?: unknown;
    where?: unknown;
  }> = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call: {
      fields: Record<string, unknown>;
      table?: unknown;
      where?: unknown;
    } = { fields };
    calls.push(call);
    const consume = () => queue.shift() ?? [];
    const chain = {
      from: vi.fn((table: unknown) => {
        call.table = table;
        return chain;
      }),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn((where: unknown) => {
        call.where = where;
        return chain;
      }),
      groupBy: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => Promise.resolve(consume())),
      then: (
        resolve: (value: Array<Record<string, unknown>>) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(consume()).then(resolve, reject),
    };
    return chain;
  });
  return { calls, database: { select } };
};

const ids = {
  vocabulary: '00000000-0000-4000-8000-000000000001',
  meaning: '00000000-0000-4000-8000-000000000002',
  pronunciation: '00000000-0000-4000-8000-000000000003',
  media: '00000000-0000-4000-8000-000000000004',
  sentenceA: '00000000-0000-4000-8000-000000000005',
  sentenceB: '00000000-0000-4000-8000-000000000006',
  questionA: '00000000-0000-4000-8000-000000000007',
  questionB: '00000000-0000-4000-8000-000000000008',
} as const;

describe('DrizzleAdminVocabularyQuery 모든 상태 목록', () => {
  it('normalized Thai·kind·status 필터와 stable page/count/order를 반환한다', async () => {
    const updatedAt = new Date('2026-07-24T00:00:00.000Z');
    const fake = createSelectFake([
      [{ totalItems: 1 }],
      [
        {
          id: ids.vocabulary,
          thai: 'สวัสดี ครับ',
          kind: 'EXPRESSION',
          status: 'HIDDEN',
          meaningCount: 2,
          pronunciationCount: 1,
          updatedAt,
        },
      ],
    ]);
    const query = new DrizzleAdminVocabularyQuery(fake.database as never);

    await expect(
      query.list({
        query: '  สวัสดี\u200B   ครับ  ',
        kind: 'EXPRESSION',
        status: 'HIDDEN',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: ids.vocabulary,
          thai: 'สวัสดี ครับ',
          kind: 'EXPRESSION',
          status: 'HIDDEN',
          meaningCount: 2,
          pronunciationCount: 1,
          updatedAt,
        },
      ],
      page: {
        page: 2,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(fake.calls.map(({ table }) => table)).toEqual([
      vocabularies,
      vocabularies,
    ]);
  });

  it('%·_·역슬래시를 wildcard가 아닌 literal substring으로 parameterize한다', async () => {
    const fake = createSelectFake([[{ totalItems: 0 }], []]);
    const query = new DrizzleAdminVocabularyQuery(fake.database as never);

    await query.list({
      query: '%_\\',
      page: 1,
      pageSize: 10,
    });

    const rendered = new PgDialect().sqlToQuery(fake.calls[0]?.where as never);
    expect(rendered.sql).toContain(' ilike ');
    expect(rendered.sql).toContain(' escape ');
    expect(rendered.params).toContain('%\\%\\_\\\\%');
    expect(rendered.sql).not.toContain('%_\\');
  });
});

const integrationDatabaseUrl = process.env.VOCABULARY_ADMIN_TEST_DATABASE_URL;

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleAdminVocabularyQuery PostgreSQL 16 통합',
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

    it('정규화 검색과 all-status count/detail distinct usage를 private field 없이 반환한다', async () => {
      const actorUserId = randomUUID();
      const mediaAssetId = randomUUID();
      const vocabularyId = randomUUID();
      const otherVocabularyId = randomUUID();
      const meaningId = randomUUID();
      const pronunciationId = randomUUID();
      const suffix = randomUUID();
      const thai = `สวัสดี ครับ ${suffix}`;
      await pool.query(
        `insert into users (id, cognito_sub, email, role, status)
         values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
        [
          actorUserId,
          `query-${actorUserId}`,
          `query-${actorUserId}@example.com`,
        ],
      );
      await pool.query(
        `insert into media_assets (
           id, storage_key, declared_mime_type, declared_size_bytes,
           declared_sha256, mime_type, size_bytes, sha256, status, ready_at
         ) values (
           $1, $2, 'audio/mpeg', 1, $3,
           'audio/mpeg', 1, $3, 'READY', now()
         )`,
        [mediaAssetId, `audio/private-${mediaAssetId}`, 'a'.repeat(64)],
      );
      await pool.query(
        `insert into vocabularies (
           id, thai, normalized_thai, kind, status
         ) values ($1, $2, $2, 'EXPRESSION', 'HIDDEN')`,
        [vocabularyId, thai],
      );
      await pool.query(
        `insert into vocabularies (
           id, thai, normalized_thai, kind, status, updated_at
         ) values
           ($1, $2, $2, 'EXPRESSION', 'HIDDEN', $3),
           ($4, $5, $5, 'EXPRESSION', 'HIDDEN', $3)
         on conflict (id) do update set updated_at = excluded.updated_at`,
        [
          vocabularyId,
          thai,
          new Date('2026-07-24T00:00:00.000Z'),
          otherVocabularyId,
          `${thai} 추가`,
        ],
      );
      await pool.query(
        `insert into vocabulary_meanings (
           id, vocabulary_id, meaning_ko, part_of_speech, difficulty
         ) values ($1, $2, '안녕하세요', '감탄사', 1)`,
        [meaningId, vocabularyId],
      );
      await pool.query(
        `insert into vocabulary_pronunciations (
           id, vocabulary_id, pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, $2, '싸왓디 크랍', 'L-L-M-H', $3)`,
        [pronunciationId, vocabularyId, mediaAssetId],
      );
      await pool.query(
        `insert into vocabulary_meaning_pronunciations (
           vocabulary_id, meaning_id, pronunciation_id
         ) values ($1, $2, $3)`,
        [vocabularyId, meaningId, pronunciationId],
      );

      const sentenceVersionIds = [randomUUID(), randomUUID()].sort();
      for (const sentenceVersionId of sentenceVersionIds) {
        const sentenceId = randomUUID();
        await pool.query(`insert into thai_sentences (id) values ($1)`, [
          sentenceId,
        ]);
        await pool.query(
          `insert into thai_sentence_versions (
             id, sentence_id, version, original_text, translation_ko,
             pronunciation_ko, tone_marks, media_asset_id
           ) values ($1, $2, 1, 'กข', '뜻', '꺼커', '--', $3)`,
          [sentenceVersionId, sentenceId, mediaAssetId],
        );
        await pool.query(
          `insert into token_occurrences (
             id, sentence_version_id, position, surface, start_offset, end_offset,
             vocabulary_id, meaning_id, pronunciation_id,
             context_meaning_ko, role
           ) values
             ($1, $2, 0, 'ก', 0, 1, $3, $4, $5, '뜻', 'TARGET'),
             ($6, $2, 1, 'ข', 1, 2, $3, $4, $5, '뜻', 'SUPPORTING')`,
          [
            randomUUID(),
            sentenceVersionId,
            vocabularyId,
            meaningId,
            pronunciationId,
            randomUUID(),
          ],
        );
        await pool.query(
          `insert into expression_occurrences (
             id, sentence_version_id, start_token_index, end_token_index,
             vocabulary_id, vocabulary_kind, representative
           ) values ($1, $2, 0, 2, $3, 'EXPRESSION', true)`,
          [randomUUID(), sentenceVersionId, vocabularyId],
        );
      }

      const questionTypeId = randomUUID();
      const typeVersionId = randomUUID();
      const questionId = randomUUID();
      const questionVersionId = randomUUID();
      const blockId = randomUUID();
      await pool.query(
        `insert into question_types (id, slug, display_name, skill)
         values ($1, $2, 'Task 8 Query', 'READING')`,
        [questionTypeId, `task8-query-${randomUUID()}`],
      );
      await pool.query(
        `insert into question_type_versions (
           id, question_type_id, version, template, option_count, decision_rules
         ) values ($1, $2, 1, 'STANDARD_CHOICE', 1, '{}'::jsonb)`,
        [typeVersionId, questionTypeId],
      );
      await pool.query(
        `insert into questions (id, status) values ($1, 'DRAFT')`,
        [questionId],
      );
      await pool.query(
        `insert into question_versions (
           id, question_id, version, type_version_id, difficulty, status
         ) values ($1, $2, 1, $3, 1, 'DRAFT')`,
        [questionVersionId, questionId, typeVersionId],
      );
      await pool.query(
        `insert into question_blocks (
           id, question_version_id, kind, display_mode, position
         ) values ($1, $2, 'QUESTION', 'TEXT', 0)`,
        [blockId, questionVersionId],
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
         ) values ($1, $2, $3, 0, true)`,
        [randomUUID(), questionVersionId, sentenceVersionIds[1]],
      );

      const query = new DrizzleAdminVocabularyQuery(
        drizzle({ client: pool, schema }),
      );
      const list = await query.list({
        query: `  สวัสดี\u200B   ครับ ${suffix}  `,
        kind: 'EXPRESSION',
        status: 'HIDDEN',
        page: 1,
        pageSize: 20,
      });
      const detail = await query.findById(vocabularyId);

      expect(list.page.totalItems).toBe(2);
      expect(list.items.map(({ id }) => id)).toEqual(
        [vocabularyId, otherVocabularyId].sort().reverse(),
      );
      expect(list.items.find(({ id }) => id === vocabularyId)).toMatchObject({
        meaningCount: 1,
        pronunciationCount: 1,
        status: 'HIDDEN',
      });
      expect(detail).toMatchObject({
        id: vocabularyId,
        usage: {
          sentenceVersionIds,
          questionVersionIds: [questionVersionId],
        },
      });
      expect(detail).not.toHaveProperty('normalizedThai');
      expect(detail).not.toHaveProperty('storageKey');
      expect(detail).not.toHaveProperty('requestHash');
      expect(detail).not.toHaveProperty('referenceMap');
      expect(detail).not.toHaveProperty('actorUserId');
      expect(JSON.stringify(detail)).not.toContain('audio/private-');
    });

    it('%·_·역슬래시를 포함한 검색어는 literal substring만 찾는다', async () => {
      const suffix = randomUUID();
      const literalId = randomUUID();
      const wildcardDecoyId = randomUUID();
      await pool.query(
        `insert into vocabularies (
           id, thai, normalized_thai, kind, status
         ) values
           ($1, $2, $2, 'WORD', 'DRAFT'),
           ($3, $4, $4, 'WORD', 'DRAFT')`,
        [
          literalId,
          `literal%_\\needle-${suffix}`,
          wildcardDecoyId,
          `literalAB\\needle-${suffix}`,
        ],
      );
      const query = new DrizzleAdminVocabularyQuery(
        drizzle({ client: pool, schema }),
      );

      const result = await query.list({
        query: `%_\\needle-${suffix}`,
        page: 1,
        pageSize: 20,
      });

      expect(result.items.map(({ id }) => id)).toEqual([literalId]);
      expect(result.page.totalItems).toBe(1);
    });
  },
);

describe('DrizzleAdminVocabularyQuery 상세', () => {
  it('뜻·발음·mapping과 distinct sentence/question version usage를 ID stable order로 반환한다', async () => {
    const createdAt = new Date('2026-07-24T00:00:00.000Z');
    const updatedAt = new Date('2026-07-24T01:00:00.000Z');
    const fake = createSelectFake([
      [
        {
          id: ids.vocabulary,
          thai: 'สวัสดี',
          kind: 'WORD',
          status: 'DRAFT',
          mergedIntoVocabularyId: null,
          createdAt,
          updatedAt,
        },
      ],
      [
        {
          id: ids.meaning,
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      [
        {
          id: ids.pronunciation,
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaAssetId: ids.media,
          mediaStatus: 'READY',
        },
      ],
      [{ meaningId: ids.meaning, pronunciationId: ids.pronunciation }],
      [{ sentenceVersionId: ids.sentenceB }],
      [
        { sentenceVersionId: ids.sentenceA },
        { sentenceVersionId: ids.sentenceB },
      ],
      [
        { questionVersionId: ids.questionB },
        { questionVersionId: ids.questionA },
      ],
      [{ questionVersionId: ids.questionB }],
    ]);
    const query = new DrizzleAdminVocabularyQuery(fake.database as never);

    const result = await query.findById(ids.vocabulary);

    expect(result).toEqual({
      id: ids.vocabulary,
      thai: 'สวัสดี',
      kind: 'WORD',
      status: 'DRAFT',
      mergedIntoVocabularyId: null,
      meanings: [
        {
          id: ids.meaning,
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      pronunciations: [
        {
          id: ids.pronunciation,
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaAssetId: ids.media,
          mediaStatus: 'READY',
        },
      ],
      meaningPronunciations: [
        { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
      ],
      relations: [],
      usage: {
        sentenceVersionIds: [ids.sentenceA, ids.sentenceB],
        questionVersionIds: [ids.questionA, ids.questionB],
      },
      createdAt,
      updatedAt,
    });
    expect(Object.keys(fake.calls[2]?.fields ?? {})).not.toContain(
      'storageKey',
    );
    expect(fake.calls[2]?.table).toBe(vocabularyPronunciations);
    expect(Object.values(fake.calls[2]?.fields ?? {})).not.toContain(
      mediaAssets.storageKey,
    );
  });

  it('없는 어휘는 null이며 child·usage를 조회하지 않는다', async () => {
    const fake = createSelectFake([[]]);
    const query = new DrizzleAdminVocabularyQuery(fake.database as never);

    await expect(query.findById(ids.vocabulary)).resolves.toBeNull();
    expect(fake.calls).toHaveLength(1);
  });

  it('media 없는 발음 projection은 private FK 손상으로 거절한다', async () => {
    const fake = createSelectFake([
      [
        {
          id: ids.vocabulary,
          thai: 'สวัสดี',
          kind: 'WORD',
          status: 'DRAFT',
          mergedIntoVocabularyId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [],
      [
        {
          id: ids.pronunciation,
          pronunciationKo: '싸왓디',
          toneMarks: '',
          mediaAssetId: null,
          mediaStatus: null,
        },
      ],
      [],
      [],
      [],
      [],
      [],
    ]);
    const query = new DrizzleAdminVocabularyQuery(fake.database as never);

    await expect(query.findById(ids.vocabulary)).rejects.toMatchObject({
      code: 'ADMIN_VOCABULARY_QUERY_INTEGRITY_ERROR',
    });
  });
});
