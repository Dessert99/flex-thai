/** 학습자 어휘 read model의 검색·사용처·게시 무결성을 검증한다 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseSchema as schema } from '../schema/databaseSchema.js';
import { vocabularies } from '../schema/vocabulary.schema.js';
import { DrizzleLearnerVocabularyQuery } from './drizzle-learner-vocabulary.query.js';
import { DrizzleWordbookQuery } from './drizzle-wordbook.query.js';

type QueryResult = Array<Record<string, unknown>>;

interface SelectCall {
  fields: Record<string, unknown>;
  from?: unknown;
  joins: Array<{ kind: 'inner' | 'left'; table: unknown; condition: unknown }>;
  condition?: unknown;
  orderBy: unknown[];
  limit?: number;
  offset?: number;
}

const toSql = (value: unknown) => new PgDialect().sqlToQuery(value as never);

const createSelectFake = (selectResults: QueryResult[]) => {
  const results = [...selectResults];
  const selectCalls: SelectCall[] = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call: SelectCall = { fields, joins: [], orderBy: [] };
    selectCalls.push(call);
    const chain = {
      from: vi.fn((table: unknown) => {
        call.from = table;
        return chain;
      }),
      innerJoin: vi.fn((table: unknown, condition: unknown) => {
        call.joins.push({ kind: 'inner', table, condition });
        return chain;
      }),
      leftJoin: vi.fn((table: unknown, condition: unknown) => {
        call.joins.push({ kind: 'left', table, condition });
        return chain;
      }),
      where: vi.fn((condition: unknown) => {
        call.condition = condition;
        return chain;
      }),
      orderBy: vi.fn((...orderBy: unknown[]) => {
        call.orderBy = orderBy;
        return chain;
      }),
      limit: vi.fn((limit: number) => {
        call.limit = limit;
        return chain;
      }),
      offset: vi.fn((offset: number) => {
        call.offset = offset;
        return chain;
      }),
      then: (
        resolve: (value: QueryResult) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(results.shift() ?? []).then(resolve, reject),
    };
    return chain;
  });
  return { database: { select }, selectCalls };
};

const createSqlCaptureDatabase = (results: unknown[][][] = []) => {
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

const summaryRows = {
  bases: [
    {
      id: 'vocabulary-2',
      thai: 'ขอบคุณ',
      kind: 'WORD',
      saved: false,
    },
    {
      id: 'vocabulary-1',
      thai: 'สวัสดี',
      kind: 'WORD',
      saved: true,
    },
  ],
  meanings: [
    {
      id: 'meaning-2',
      vocabularyId: 'vocabulary-1',
      meaningKo: '안녕',
      pronunciationKo: '싸왓디',
      toneMarks: 'L-L-M',
      partOfSpeech: '감탄사',
      difficulty: 2,
      contextNote: null,
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    },
    {
      id: 'meaning-1',
      vocabularyId: 'vocabulary-1',
      meaningKo: '안녕하세요',
      pronunciationKo: '사왓디',
      toneMarks: 'L-L-M',
      partOfSpeech: '감탄사',
      difficulty: 1,
      contextNote: '정중한 인사',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    },
    {
      id: 'meaning-3',
      vocabularyId: 'vocabulary-2',
      meaningKo: '감사합니다',
      pronunciationKo: '컵쿤',
      toneMarks: 'L-M',
      partOfSpeech: '감탄사',
      difficulty: 1,
      contextNote: null,
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    },
  ],
  pronunciations: [
    {
      id: 'meaning-2',
      vocabularyId: 'vocabulary-1',
      pronunciationKo: '싸왓디',
      toneMarks: 'L-L-M',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    },
    {
      id: 'meaning-1',
      vocabularyId: 'vocabulary-1',
      pronunciationKo: '사왓디',
      toneMarks: 'L-L-M',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    },
    {
      id: 'meaning-3',
      vocabularyId: 'vocabulary-2',
      pronunciationKo: '컵쿤',
      toneMarks: 'L-M',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    },
  ],
} as const;

describe('DrizzleLearnerVocabularyQuery 공용 어휘 검색', () => {
  it('전체 SELECT에서도 correlated subquery 컬럼을 명시적으로 한정한다', async () => {
    const capture = createSqlCaptureDatabase();
    const query = new DrizzleLearnerVocabularyQuery(capture.database);

    await query.listVocabularies('user-id', { page: 1, pageSize: 20 });

    expect(capture.queries[1]).toContain('saved_items.vocabulary_id');
    expect(capture.queries[1]).toContain('saved_wordbooks.user_id');
    expect(capture.queries[1]).toContain('"vocabularies"."id"');
  });

  it('WHERE의 correlated helper도 전체 query에서 컬럼 한정을 유지한다', async () => {
    const listCapture = createSqlCaptureDatabase();
    await new DrizzleLearnerVocabularyQuery(
      listCapture.database,
    ).listVocabularies('user-id', {
      query: '안녕',
      partOfSpeech: '감탄사',
      difficulty: 1,
      page: 1,
      pageSize: 20,
    });

    expect(listCapture.queries[0]).toContain(
      '"vocabulary_meanings"."vocabulary_id" = "vocabularies"."id"',
    );
    expect(listCapture.queries[0]).toContain(
      '"vocabulary_meanings"."vocabulary_id" = "vocabularies"."id"',
    );

    const relatedCapture = createSqlCaptureDatabase();
    await new DrizzleLearnerVocabularyQuery(
      relatedCapture.database,
    ).listRelatedQuestions('user-id', 'vocabulary-id', {
      page: 1,
      pageSize: 20,
    });

    expect(relatedCapture.queries[0]).toContain(
      '"question_vocabularies"."question_id" = "questions"."id"',
    );

    const createdAt = new Date('2026-07-27T00:00:00.000Z');
    const detailCapture = createSqlCaptureDatabase([
      [['vocabulary-id', 'สวัสดี', 'WORD', false]],
      [],
      [['pronunciation-id', 'vocabulary-id', '싸왓디', '-', createdAt]],
      [],
      [],
    ]);
    await new DrizzleLearnerVocabularyQuery(
      detailCapture.database,
    ).getVocabularyDetail('user-id', 'vocabulary-id');

    expect(detailCapture.queries.join(' ')).not.toContain(
      'question_block_sentences',
    );
    expect(detailCapture.queries.join(' ')).not.toContain('token_occurrences');
  });

  it('저장 여부는 사용자 소유 단어장 membership으로 계산한다', async () => {
    const fake = createSelectFake([
      [{ totalItems: 2 }],
      [...summaryRows.bases],
      [...summaryRows.meanings],
    ]);
    const query = new DrizzleLearnerVocabularyQuery(fake.database as never);

    const result = await query.listVocabularies('user-id', {
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map(({ saved }) => saved)).toEqual([false, true]);
    const savedSql = toSql(fake.selectCalls[1]?.fields.saved);
    expect(savedSql.sql).toContain('exists');
    expect(savedSql.sql).toContain('wordbooks');
    expect(savedSql.sql).toContain('wordbook_items');
    expect(savedSql.sql).not.toContain('saved_vocabularies');
    expect(savedSql.params).toContain('user-id');

    expect(fake.selectCalls[1]?.joins).toHaveLength(0);
  });

  it('정규화 태국어와 한국어·분류 필터를 같은 게시 어휘에 적용한다', async () => {
    const fake = createSelectFake([
      [{ totalItems: 2 }],
      [...summaryRows.bases],
      [...summaryRows.meanings],
    ]);
    const query = new DrizzleLearnerVocabularyQuery(fake.database as never);

    const result = await query.listVocabularies('user-id', {
      query: '\u200b สวัสดี  ',
      kind: 'WORD',
      partOfSpeech: '감탄사',
      difficulty: 1,
      page: 2,
      pageSize: 10,
    });

    expect(result.page).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 2,
      totalPages: 1,
    });
    expect(result.items.map((item) => item.id)).toEqual([
      'vocabulary-2',
      'vocabulary-1',
    ]);
    expect(result.items[1]?.meanings.map((meaning) => meaning.id)).toEqual([
      'meaning-1',
      'meaning-2',
    ]);
    expect(
      result.items[1]?.pronunciations.map((pronunciation) => pronunciation.id),
    ).toEqual(['meaning-1', 'meaning-2']);

    expect(fake.selectCalls[0]?.from).toBe(vocabularies);
    expect(fake.selectCalls[1]?.from).toBe(vocabularies);
    for (const call of fake.selectCalls.slice(0, 2)) {
      const condition = toSql(call.condition);
      expect(condition.params).toEqual(
        expect.arrayContaining([
          'PUBLISHED',
          'WORD',
          '감탄사',
          1,
          '%สวัสดี%',
          '%\u200b สวัสดี  %',
        ]),
      );
      expect(condition.sql.toLowerCase()).toContain('ilike');
      expect(condition.sql).toContain('vocabulary_meanings');
      expect(condition.sql).toContain('vocabulary_meanings');
    }
    expect(fake.selectCalls[1]).toMatchObject({ limit: 10, offset: 10 });
    expect(toSql(fake.selectCalls[1]?.orderBy[0]).sql).toContain(
      '"vocabularies"."id" asc',
    );
  });

  it('뜻·발음 filter와 무관하게 선택된 어휘의 모든 하위 정보를 반환한다', async () => {
    const fake = createSelectFake([
      [{ totalItems: 1 }],
      [summaryRows.bases[1]],
      [...summaryRows.meanings],
    ]);
    const query = new DrizzleLearnerVocabularyQuery(fake.database as never);

    const result = await query.listVocabularies('user-id', {
      partOfSpeech: '감탄사',
      difficulty: 1,
      page: 1,
      pageSize: 20,
    });

    expect(result.items[0]?.meanings).toHaveLength(2);
    expect(result.items[0]?.pronunciations).toHaveLength(2);
  });
});

describe('DrizzleLearnerVocabularyQuery 상세와 예문', () => {
  it('뜻·발음 exact link와 현재 게시 문제의 동결 예문을 중복 없이 조립한다', async () => {
    const fake = createSelectFake([
      [summaryRows.bases[1]],
      [...summaryRows.meanings.slice(0, 2)],
      [
        {
          id: 'relation-1',
          type: 'SYNONYM',
          direction: 'BIDIRECTIONAL',
          sourceMeaningId: 'meaning-1',
          sourceVocabularyId: 'vocabulary-1',
          sourceThai: 'สวัสดี',
          sourceMeaningKo: '안녕하세요',
          targetMeaningId: 'related-meaning-1',
          targetVocabularyId: 'related-vocabulary-1',
          targetThai: 'หวัดดี',
          targetMeaningKo: '안녕',
        },
      ],
    ]);
    const query = new DrizzleLearnerVocabularyQuery(fake.database as never);

    const detail = await query.getVocabularyDetail('user-id', 'vocabulary-1');

    expect(detail?.meaningPronunciations).toEqual([
      { meaningId: 'meaning-1', pronunciationId: 'meaning-1' },
      { meaningId: 'meaning-2', pronunciationId: 'meaning-2' },
    ]);
    expect(detail?.exampleSentences).toEqual([]);
    expect(detail?.relations).toEqual([
      {
        id: 'relation-1',
        type: 'SYNONYM',
        direction: 'BIDIRECTIONAL',
        meaningId: 'meaning-1',
        relatedVocabularyId: 'related-vocabulary-1',
        relatedThai: 'หวัดดี',
        relatedMeaningId: 'related-meaning-1',
        relatedMeaningKo: '안녕',
      },
    ]);
    const relationCondition = toSql(fake.selectCalls[2]?.condition);
    expect(relationCondition.params).toEqual(
      expect.arrayContaining([
        'PASSED',
        'PUBLISHED',
        'BIDIRECTIONAL',
        'vocabulary-1',
      ]),
    );
  });

  it('게시되지 않은 어휘는 상세을 반환하지 않는다', async () => {
    const fake = createSelectFake([[]]);
    const query = new DrizzleLearnerVocabularyQuery(fake.database as never);

    await expect(
      query.getVocabularyDetail('user-id', 'hidden-vocabulary-id'),
    ).resolves.toBeNull();
  });

  it('뜻 행에서 발음을 읽어 별도 연결 조회 없이 상세를 반환한다', async () => {
    const fake = createSelectFake([
      [summaryRows.bases[1]],
      [summaryRows.meanings[0]],
      [],
      [],
      [],
      [],
    ]);
    const detail = await new DrizzleLearnerVocabularyQuery(
      fake.database as never,
    ).getVocabularyDetail('user-id', 'vocabulary-1');
    expect(detail?.pronunciations).toEqual([
      { id: 'meaning-2', pronunciationKo: '싸왓디', toneMarks: 'L-L-M' },
    ]);
    expect(detail?.meaningPronunciations).toEqual([
      { meaningId: 'meaning-2', pronunciationId: 'meaning-2' },
    ]);
  });
});

describe('DrizzleLearnerVocabularyQuery 관련 문제와 저장 목록', () => {
  it('legacy 저장 어휘 목록 read model을 공개하지 않는다', () => {
    const query = new DrizzleLearnerVocabularyQuery(
      createSelectFake([]).database as never,
    );

    expect(query).not.toHaveProperty('listSavedVocabularies');
  });

  it('현재 문제의 어휘 연결로 관련 문제와 마지막 풀이 상태를 조회한다', async () => {
    const question = {
      questionId: 'question-id',
      questionVersion: 2,
      questionType: {
        id: 'type-id',
        slug: 'reading-choice',
        displayName: '독해 선택',
      },
      skill: 'READING',
      difficulty: 2,
      saved: true,
      firstResult: 'UPDATED',
    };
    const fake = createSelectFake([
      [{ total: 1 }],
      [
        {
          ...question,
          tagIds: [],
          majorCategory: 'READING_PASSAGE',
          topic: { id: 'topic' },
        },
      ],
      [],
    ]);
    const query = new DrizzleLearnerVocabularyQuery(fake.database as never);
    const result = await query.listRelatedQuestions(
      'user-id',
      'vocabulary-id',
      { page: 1, pageSize: 20 },
    );
    expect(result.items).toEqual([question]);
    expect(toSql(fake.selectCalls[0]?.condition).sql).toContain(
      'question_vocabularies',
    );
  });
});

const integrationDatabaseUrl =
  process.env.LEARNER_VOCABULARY_QUERY_TEST_DATABASE_URL ??
  process.env.VOCABULARY_PRACTICE_TEST_DATABASE_URL;

const ids = {
  user: '11000000-0000-4000-8000-000000000001',
  vocabulary: [
    '31000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000003',
  ],
  meaning: [
    '32000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000003',
  ],
  pronunciation: [
    '33000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8000-000000000003',
  ],
  sentence: '41000000-0000-4000-8000-000000000001',
  sentenceVersion: '42000000-0000-4000-8000-000000000001',
  type: '51000000-0000-4000-8000-000000000001',
  typeVersion: '52000000-0000-4000-8000-000000000001',
  question: '61000000-0000-4000-8000-000000000001',
  questionVersion: '62000000-0000-4000-8000-000000000001',
  block: '71000000-0000-4000-8000-000000000001',
  option: '81000000-0000-4000-8000-000000000001',
  wordbook: '91000000-0000-4000-8000-000000000001',
  invalidVocabulary: '31000000-0000-4000-8000-000000000099',
  invalidMeaning: '32000000-0000-4000-8000-000000000099',
  invalidPronunciation: '33000000-0000-4000-8000-000000000099',
} as const;

const cleanupVocabularyQueryFixture = async (pool: Pool): Promise<void> => {
  await pool.query(`delete from wordbook_items where wordbook_id = $1`, [
    ids.wordbook,
  ]);
  await pool.query(`delete from wordbooks where id = $1`, [ids.wordbook]);
  await pool.query(`delete from question_options where id = $1`, [ids.option]);
  await pool.query(`delete from question_block_sentences where block_id = $1`, [
    ids.block,
  ]);
  await pool.query(`delete from question_blocks where id = $1`, [ids.block]);
  await pool.query(
    `update questions set current_published_version_id = null where id = $1`,
    [ids.question],
  );
  await pool.query(`delete from question_versions where id = $1`, [
    ids.questionVersion,
  ]);
  await pool.query(`delete from questions where id = $1`, [ids.question]);
  await pool.query(`delete from question_type_versions where id = $1`, [
    ids.typeVersion,
  ]);
  await pool.query(`delete from question_types where id = $1`, [ids.type]);
  await pool.query(
    `delete from expression_occurrences where sentence_version_id = $1`,
    [ids.sentenceVersion],
  );
  await pool.query(
    `delete from token_occurrences where sentence_version_id = $1`,
    [ids.sentenceVersion],
  );
  await pool.query(`delete from thai_sentence_versions where id = $1`, [
    ids.sentenceVersion,
  ]);
  await pool.query(`delete from thai_sentences where id = $1`, [ids.sentence]);
  await pool.query(
    `delete from vocabulary_meaning_pronunciations
     where vocabulary_id = any($1::uuid[])`,
    [[...ids.vocabulary, ids.invalidVocabulary]],
  );
  await pool.query(
    `delete from vocabulary_pronunciations where id = any($1::uuid[])`,
    [[...ids.pronunciation, ids.invalidPronunciation]],
  );
  await pool.query(
    `delete from vocabulary_meanings where id = any($1::uuid[])`,
    [[...ids.meaning, ids.invalidMeaning]],
  );
  await pool.query(`delete from vocabularies where id = any($1::uuid[])`, [
    [...ids.vocabulary, ids.invalidVocabulary],
  ]);
  await pool.query(`delete from users where id = $1`, [ids.user]);
};

const createVocabularyQueryFixture = async (pool: Pool): Promise<void> => {
  await pool.query(
    `insert into users (id, cognito_sub, email, status)
     values ($1, 'vocabulary-query-user', 'vocabulary-query@example.com', 'ACTIVE')`,
    [ids.user],
  );
  await pool.query(
    `insert into vocabularies (id, thai, normalized_thai, kind, status)
     values
       ($1, 'ศัพท์ทดสอบอัลฟา', 'ศัพท์ทดสอบอัลฟา', 'WORD', 'PUBLISHED'),
       ($2, 'วลีทดสอบเบตา', 'วลีทดสอบเบตา', 'EXPRESSION', 'PUBLISHED'),
       ($3, 'ศัพท์ทดสอบซ่อน', 'ศัพท์ทดสอบซ่อน', 'WORD', 'HIDDEN')`,
    [...ids.vocabulary],
  );
  await pool.query(
    `insert into vocabulary_meanings
       (id, vocabulary_id, meaning_ko, part_of_speech, difficulty)
     values
       ($1, $4, '안녕하세요', '감탄사', 1),
       ($2, $4, '안녕', '인사말', 2),
       ($3, $5, '매우 감사합니다', '표현', 3)`,
    [...ids.meaning, ids.vocabulary[0], ids.vocabulary[1]],
  );
  await pool.query(
    `insert into vocabulary_pronunciations
       (id, vocabulary_id, pronunciation_ko, tone_marks)
     values
       ($1, $4, '싸왓디', '-'),
       ($2, $4, '사왓디', '-'),
       ($3, $5, '컵쿤 막', '-')`,
    [...ids.pronunciation, ids.vocabulary[0], ids.vocabulary[1]],
  );
  await pool.query(
    `insert into vocabulary_meaning_pronunciations
       (vocabulary_id, meaning_id, pronunciation_id)
     values ($1, $2, $4), ($1, $3, $5), ($6, $7, $8)`,
    [
      ids.vocabulary[0],
      ids.meaning[0],
      ids.meaning[1],
      ids.pronunciation[0],
      ids.pronunciation[1],
      ids.vocabulary[1],
      ids.meaning[2],
      ids.pronunciation[2],
    ],
  );
  await pool.query(`insert into thai_sentences (id) values ($1)`, [
    ids.sentence,
  ]);
  await pool.query(
    `insert into thai_sentence_versions (
       id, sentence_id, version, original_text, translation_ko,
       pronunciation_ko, tone_marks, frozen_at
     ) values ($1, $2, 1, 'ศัพท์ทดสอบอัลฟา วลีทดสอบเบตา', '안녕하세요, 매우 감사합니다',
               '싸왓디 컵쿤 막', '-', now())`,
    [ids.sentenceVersion, ids.sentence],
  );
  await pool.query(
    `insert into token_occurrences (
       sentence_version_id, position, surface, start_offset, end_offset,
       vocabulary_id, meaning_id, pronunciation_id, context_meaning_ko, role
     ) values ($1, 0, 'ศัพท์ทดสอบอัลฟา', 0, 15, $2, $3, $4, '안녕하세요', 'TARGET')`,
    [
      ids.sentenceVersion,
      ids.vocabulary[0],
      ids.meaning[0],
      ids.pronunciation[0],
    ],
  );
  await pool.query(
    `insert into expression_occurrences (
       sentence_version_id, start_token_index, end_token_index,
       vocabulary_id, vocabulary_kind, meaning_id, pronunciation_id,
       context_meaning_ko, representative
     ) values ($1, 0, 2, $2, 'EXPRESSION', $3, $4, '매우 감사합니다', true)`,
    [
      ids.sentenceVersion,
      ids.vocabulary[1],
      ids.meaning[2],
      ids.pronunciation[2],
    ],
  );
  await pool.query(
    `insert into question_types (id, slug, display_name, skill)
     values ($1, 'vocabulary-reading', '어휘 독해', 'READING')`,
    [ids.type],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 1, '{}')`,
    [ids.typeVersion, ids.type],
  );
  await pool.query(
    `insert into questions (id, status) values ($1, 'PUBLISHED')`,
    [ids.question],
  );
  await pool.query(
    `insert into question_versions (
       id, question_id, version, type_version_id, difficulty, status,
       validation_status, validation_issues, published_at
     ) values ($1, $2, 1, $3, 2, 'PUBLISHED', 'PASSED', '[]', now())`,
    [ids.questionVersion, ids.question, ids.typeVersion],
  );
  await pool.query(
    `update questions set current_published_version_id = $2 where id = $1`,
    [ids.question, ids.questionVersion],
  );
  await pool.query(
    `insert into question_blocks
       (id, question_version_id, kind, position)
     values ($1, $2, 'QUESTION', 0)`,
    [ids.block, ids.questionVersion],
  );
  await pool.query(
    `insert into question_block_sentences
       (block_id, sentence_version_id, position)
     values ($1, $2, 0)`,
    [ids.block, ids.sentenceVersion],
  );
  await pool.query(
    `insert into question_options
       (id, question_version_id, sentence_version_id, position, is_correct)
     values ($1, $2, $3, 0, true)`,
    [ids.option, ids.questionVersion, ids.sentenceVersion],
  );
  await pool.query(
    `insert into wordbooks (id, user_id, name, created_at, updated_at)
     values ($1, $2, '통합 어휘', now(), now())`,
    [ids.wordbook, ids.user],
  );
  await pool.query(
    `insert into wordbook_items (wordbook_id, vocabulary_id, added_at)
     values ($1, $2, now())`,
    [ids.wordbook, ids.vocabulary[0]],
  );
};

describe.runIf(integrationDatabaseUrl !== undefined)(
  'DrizzleLearnerVocabularyQuery PostgreSQL 16 projection',
  () => {
    let pool: Pool;
    let query: DrizzleLearnerVocabularyQuery;
    let wordbookQuery: DrizzleWordbookQuery;

    beforeAll(async () => {
      if (!integrationDatabaseUrl) {
        throw new Error('LEARNER_VOCABULARY_QUERY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: integrationDatabaseUrl });
      await cleanupVocabularyQueryFixture(pool);
      await createVocabularyQueryFixture(pool);
      query = new DrizzleLearnerVocabularyQuery(
        drizzle({ client: pool, schema }),
      );
      wordbookQuery = new DrizzleWordbookQuery(
        drizzle({ client: pool, schema }),
      );
    });

    afterAll(async () => {
      try {
        await cleanupVocabularyQueryFixture(pool);
      } finally {
        await pool.end();
      }
    });

    it('검색·필터·페이지가 어휘 중복 없이 모든 뜻과 발음을 보존한다', async () => {
      const result = await query.listVocabularies(ids.user, {
        query: '\u200b ศัพท์ทดสอบอัลฟา ',
        kind: 'WORD',
        partOfSpeech: '감탄사',
        difficulty: 1,
        page: 1,
        pageSize: 20,
      });

      expect(result.page).toMatchObject({ totalItems: 1, totalPages: 1 });
      expect(result.items[0]).toMatchObject({
        id: ids.vocabulary[0],
        saved: true,
      });
      expect(result.items[0]?.meanings).toHaveLength(2);
      expect(result.items[0]?.pronunciations).toHaveLength(2);
    });

    it('상세의 exact link와 현재 공개 문제의 동결 예문만 반환한다', async () => {
      const detail = await query.getVocabularyDetail(
        ids.user,
        ids.vocabulary[0],
      );

      expect(detail?.meaningPronunciations).toEqual([
        {
          meaningId: ids.meaning[0],
          pronunciationId: ids.pronunciation[0],
        },
        {
          meaningId: ids.meaning[1],
          pronunciationId: ids.pronunciation[1],
        },
      ]);
      expect(detail?.exampleSentences).toHaveLength(1);
      expect(detail?.exampleSentences[0]?.sentenceVersionId).toBe(
        ids.sentenceVersion,
      );
    });

    it('단어장 목록과 항목의 correlated count를 실제 PostgreSQL에서 계산한다', async () => {
      const summaries = await wordbookQuery.listWordbooks(ids.user);
      const result = await wordbookQuery.listItems(ids.user, ids.wordbook, {
        page: 1,
        pageSize: 20,
      });

      expect(summaries[0]?.itemCount).toBe(1);
      expect(result?.items[0]).toMatchObject({
        id: ids.vocabulary[0],
      });
    });

    it('token과 expression 관련 문제를 각각 중복 없이 반환한다', async () => {
      for (const vocabularyId of ids.vocabulary.slice(0, 2)) {
        const related = await query.listRelatedQuestions(
          ids.user,
          vocabularyId,
          { page: 1, pageSize: 20 },
        );
        expect(related.items.map((item) => item.questionId)).toEqual([
          ids.question,
        ]);
      }
    });
  },
);
