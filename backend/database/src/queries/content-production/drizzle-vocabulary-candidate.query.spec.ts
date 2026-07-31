import { describe, expect, it, vi } from 'vitest';
import { DrizzleVocabularyCandidateQuery } from './drizzle-vocabulary-candidate.query.js';

const candidate = {
  id: '00000000-0000-4000-8000-000000000001',
  jobId: '00000000-0000-4000-8000-000000000002',
  jobItemId: '00000000-0000-4000-8000-000000000003',
  jobAttempt: 1,
  ordinal: 0,
  thai: 'สวัสดี',
  normalizedThai: 'สวัสดี',
  kind: 'WORD' as const,
  meanings: [
    { meaningKo: '안녕하세요', partOfSpeech: '감탄사', difficulty: 1 },
  ],
  classification: 'NEW_VOCABULARY' as const,
  resultGroup: 'NORMAL' as const,
  matchedVocabularyId: null,
  suspectedMatches: [],
  reviewCode: null,
  reviewStatus: 'PENDING' as const,
  revision: 0,
  resolutionKind: null,
  resolvedVocabularyId: null,
  createdAt: new Date('2026-07-31T00:00:00.000Z'),
  updatedAt: new Date('2026-07-31T00:00:00.000Z'),
};

const createDatabase = (results: Array<Array<Record<string, unknown>>>) => {
  const queue = [...results];
  const where = vi.fn();
  const orderBy = vi.fn();
  const limit = vi.fn();
  const offset = vi.fn();
  const select = vi.fn(() => {
    const consume = () => Promise.resolve(queue.shift() ?? []);
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn((condition: unknown) => {
        where(condition);
        return chain;
      }),
      orderBy: vi.fn((...columns: unknown[]) => {
        orderBy(...columns);
        return chain;
      }),
      limit: vi.fn((value: number) => {
        limit(value);
        return chain;
      }),
      offset: vi.fn((value: number) => {
        offset(value);
        return consume();
      }),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => consume().then(resolve, reject),
    };
    return chain;
  });
  return { database: { select }, where, orderBy, limit, offset };
};

describe('DrizzleVocabularyCandidateQuery', () => {
  it('status와 jobId를 count와 page 조회 모두에 적용한 뒤 pagination한다', async () => {
    const fake = createDatabase([[{ totalItems: 1 }], [candidate]]);
    const query = new DrizzleVocabularyCandidateQuery(fake.database as never);

    await expect(
      query.list({
        jobId: candidate.jobId,
        reviewStatus: 'PENDING',
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [{ ...candidate, resolution: null }],
      totalItems: 1,
    });
    expect(fake.where).toHaveBeenCalledTimes(2);
    expect(fake.limit).toHaveBeenCalledWith(20);
    expect(fake.offset).toHaveBeenCalledWith(20);
  });

  it('상세 validation을 stage ordinal 순으로 반환한다', async () => {
    const validations = [
      {
        candidateOrdinal: 0,
        stage: 'SCHEMA',
        status: 'PASSED',
        code: null,
        details: {},
        createdAt: new Date('2026-07-31T00:00:01.000Z'),
      },
    ];
    const fake = createDatabase([[candidate], validations]);
    const query = new DrizzleVocabularyCandidateQuery(fake.database as never);

    await expect(query.findById(candidate.id)).resolves.toEqual({
      candidate: { ...candidate, resolution: null },
      validations,
    });
    expect(fake.orderBy).toHaveBeenCalledOnce();
  });
});
