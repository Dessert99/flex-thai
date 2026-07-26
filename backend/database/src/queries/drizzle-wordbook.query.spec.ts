/** 단어장 read model의 소유권·중복 없는 검색·페이지 projection을 검증한다 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../schema/index.js';
import {
  vocabularies,
  vocabularyMeanings,
  vocabularyPronunciations,
  wordbookItems,
  wordbooks,
} from '../schema/index.js';
import { DrizzleWordbookQuery } from './drizzle-wordbook.query.js';

type QueryResult = Array<Record<string, unknown>>;

interface SelectCall {
  condition?: unknown;
  fields: Record<string, unknown>;
  from?: unknown;
  joins: Array<{ kind: 'inner' | 'left'; table: unknown }>;
  limit?: number;
  offset?: number;
  orderBy: unknown[];
}

const toSql = (value: unknown) => new PgDialect().sqlToQuery(value as never);

const createSelectFake = (selectResults: QueryResult[]) => {
  const results = [...selectResults];
  const selectCalls: SelectCall[] = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call: SelectCall = { fields, joins: [], orderBy: [] };
    selectCalls.push(call);
    const chain = {
      from(table: unknown) {
        call.from = table;
        return chain;
      },
      innerJoin(table: unknown) {
        call.joins.push({ kind: 'inner', table });
        return chain;
      },
      leftJoin(table: unknown) {
        call.joins.push({ kind: 'left', table });
        return chain;
      },
      where(condition: unknown) {
        call.condition = condition;
        return chain;
      },
      orderBy(...orderBy: unknown[]) {
        call.orderBy = orderBy;
        return chain;
      },
      limit(limit: number) {
        call.limit = limit;
        return chain;
      },
      offset(offset: number) {
        call.offset = offset;
        return chain;
      },
      then(
        resolve: (value: QueryResult) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(results.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  });
  return { database: { select }, selectCalls };
};

const createSqlCaptureDatabase = (results: unknown[][][]) => {
  const queries: string[] = [];
  const client = {
    query(config: { text: string }) {
      queries.push(config.text);
      return Promise.resolve({ rows: results.shift() ?? [] });
    },
  };
  return {
    database: drizzle({ client: client as never, schema }),
    queries,
  };
};

const createdAt = new Date('2026-07-26T00:00:00.000Z');
const updatedAt = new Date('2026-07-26T01:00:00.000Z');
const wordbook = {
  id: 'wordbook-id',
  name: 'FLEX 어휘',
  itemCount: 0,
  createdAt,
  updatedAt,
};

describe('DrizzleWordbookQuery 목록과 membership', () => {
  it('전체 SELECT에서도 단어장 item count 컬럼을 명시적으로 한정한다', async () => {
    const capture = createSqlCaptureDatabase([[]]);
    const query = new DrizzleWordbookQuery(capture.database);

    await query.listWordbooks('user-id');

    expect(capture.queries[0]).toContain('counted_items.wordbook_id');
    expect(capture.queries[0]).toContain('"wordbooks"."id"');
  });

  it('사용자 단어장을 빈 단어장까지 생성 시각·ID 순서로 반환한다', async () => {
    const fake = createSelectFake([[wordbook]]);
    const query = new DrizzleWordbookQuery(fake.database as never);

    await expect(query.listWordbooks('user-id')).resolves.toEqual([wordbook]);

    const call = fake.selectCalls[0];
    expect(call?.from).toBe(wordbooks);
    expect(toSql(call?.condition).params).toEqual(['user-id']);
    expect(toSql(call?.fields.itemCount).sql).toContain('wordbook_items');
    expect(call?.orderBy).toHaveLength(2);
  });

  it('membership은 사용자 소유 단어장 ID만 안정적인 순서로 반환한다', async () => {
    const fake = createSelectFake([
      [{ wordbookId: 'wordbook-a' }, { wordbookId: 'wordbook-b' }],
    ]);
    const query = new DrizzleWordbookQuery(fake.database as never);

    await expect(
      query.listMemberships('user-id', 'vocabulary-id'),
    ).resolves.toEqual(['wordbook-a', 'wordbook-b']);

    const call = fake.selectCalls[0];
    expect(call?.from).toBe(wordbookItems);
    expect(call?.joins).toEqual([{ kind: 'inner', table: wordbooks }]);
    expect(toSql(call?.condition).params).toEqual(['user-id', 'vocabulary-id']);
  });
});

describe('DrizzleWordbookQuery 검색·필터·페이지', () => {
  it('항목 SELECT의 음성 가능 뜻 count 컬럼을 명시적으로 한정한다', async () => {
    const capture = createSqlCaptureDatabase([
      [['wordbook-id', 'FLEX 어휘', 1, createdAt, updatedAt]],
      [[0]],
      [],
    ]);
    const query = new DrizzleWordbookQuery(capture.database);

    await query.listItems('user-id', 'wordbook-id', {
      page: 1,
      pageSize: 20,
    });

    expect(capture.queries[2]).toContain('eligible_links.vocabulary_id');
    expect(capture.queries[2]).toContain(
      'eligible_pronunciations.vocabulary_id',
    );
    expect(capture.queries[2]).toContain('"vocabularies"."id"');
  });

  it('타 사용자 단어장은 상세 대신 null을 반환한다', async () => {
    const fake = createSelectFake([[]]);
    const query = new DrizzleWordbookQuery(fake.database as never);

    await expect(
      query.listItems('user-id', 'other-wordbook-id', {
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toBeNull();
    expect(fake.selectCalls).toHaveLength(1);
    expect(toSql(fake.selectCalls[0]?.condition).params).toEqual([
      'user-id',
      'other-wordbook-id',
    ]);
  });

  it('ID 페이지로 중복을 막고 선택 어휘의 모든 뜻·READY 발음을 반환한다', async () => {
    const addedAt = new Date('2026-07-26T02:00:00.000Z');
    const fake = createSelectFake([
      [{ ...wordbook, itemCount: 2 }],
      [{ totalItems: 1 }],
      [
        {
          id: 'vocabulary-id',
          thai: 'สวัสดี',
          kind: 'WORD',
          audioEligibleMeaningCount: 1,
          addedAt,
        },
      ],
      [
        {
          id: 'meaning-2',
          vocabularyId: 'vocabulary-id',
          meaningKo: '안녕',
          partOfSpeech: '감탄사',
          difficulty: 2,
          contextNote: null,
          createdAt: updatedAt,
        },
        {
          id: 'meaning-1',
          vocabularyId: 'vocabulary-id',
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
          createdAt,
        },
      ],
      [
        {
          id: 'pronunciation-id',
          vocabularyId: 'vocabulary-id',
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaAssetId: 'media-id',
          mediaStatus: 'READY',
          mediaStorageKey: 'private/vocabulary.mp3',
          createdAt,
        },
      ],
    ]);
    const query = new DrizzleWordbookQuery(fake.database as never);

    const result = await query.listItems('user-id', 'wordbook-id', {
      query: '\u200b สวัสดี  ',
      kind: 'WORD',
      partOfSpeech: '감탄사',
      difficulty: 1,
      page: 2,
      pageSize: 10,
    });

    expect(result?.page).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(result?.items).toEqual([
      {
        id: 'vocabulary-id',
        thai: 'สวัสดี',
        kind: 'WORD',
        meanings: [
          {
            id: 'meaning-1',
            meaningKo: '안녕하세요',
            partOfSpeech: '감탄사',
            difficulty: 1,
            contextNote: null,
          },
          {
            id: 'meaning-2',
            meaningKo: '안녕',
            partOfSpeech: '감탄사',
            difficulty: 2,
            contextNote: null,
          },
        ],
        pronunciations: [
          {
            id: 'pronunciation-id',
            pronunciationKo: '싸왓디',
            toneMarks: 'L-L-M',
            media: { storageKey: 'private/vocabulary.mp3' },
          },
        ],
        audioEligibleMeaningCount: 1,
        saved: true,
        addedAt,
      },
    ]);

    for (const call of fake.selectCalls.slice(1, 3)) {
      expect(call.from).toBe(vocabularies);
      expect(call.joins).toEqual([{ kind: 'inner', table: wordbookItems }]);
      const condition = toSql(call.condition);
      expect(condition.sql.toLowerCase()).toContain('ilike');
      expect(condition.params).toEqual(
        expect.arrayContaining([
          'wordbook-id',
          'PUBLISHED',
          'WORD',
          '감탄사',
          1,
          '%สวัสดี%',
          '%\u200b สวัสดี  %',
        ]),
      );
    }
    expect(fake.selectCalls[2]).toMatchObject({ limit: 10, offset: 10 });
    expect(fake.selectCalls[3]?.from).toBe(vocabularyMeanings);
    expect(fake.selectCalls[4]?.from).toBe(vocabularyPronunciations);
  });
});
