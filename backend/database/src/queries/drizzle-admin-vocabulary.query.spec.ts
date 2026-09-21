/** 관리자 어휘 list/detail의 정규화 검색·stable order·안전한 projection을 고정한다 */

import { PgDialect } from 'drizzle-orm/pg-core';

import { describe, expect, it, vi } from 'vitest';

import {
  vocabularies,
  vocabularyMeanings,
} from '../schema/vocabulary.schema.js';
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
          importanceWeight: 5,
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
      [{ sentenceVersionId: ids.sentenceB }],
      [
        { sentenceVersionId: ids.sentenceA },
        { sentenceVersionId: ids.sentenceB },
      ],
      [],
    ]);
    const query = new DrizzleAdminVocabularyQuery(fake.database as never);

    const result = await query.findById(ids.vocabulary);

    expect(result).toEqual({
      id: ids.vocabulary,
      thai: 'สวัสดี',
      kind: 'WORD',
      status: 'DRAFT',
      importanceWeight: 5,
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
      relations: [],
      usage: {
        sentenceVersionIds: [ids.sentenceA, ids.sentenceB],
      },
      createdAt,
      updatedAt,
    });
    expect(Object.keys(fake.calls[1]?.fields ?? {})).not.toContain(
      'storageKey',
    );
    expect(fake.calls[1]?.table).toBe(vocabularyMeanings);
  });

  it('없는 어휘는 null이며 child·usage를 조회하지 않는다', async () => {
    const fake = createSelectFake([[]]);
    const query = new DrizzleAdminVocabularyQuery(fake.database as never);

    await expect(query.findById(ids.vocabulary)).resolves.toBeNull();
    expect(fake.calls).toHaveLength(1);
  });
});
