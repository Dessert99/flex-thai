/** AI 문제 후보 목록·상세가 private hash 없이 안정 projection을 반환하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  DrizzleQuestionCandidateQuery,
  QuestionCandidateDataIntegrityError,
} from './drizzle-question-candidate.query.js';

const candidate = {
  id: '00000000-0000-4000-8000-000000000001',
  jobId: '00000000-0000-4000-8000-000000000099',
  jobItemId: '00000000-0000-4000-8000-000000000002',
  jobAttempt: 1,
  ordinal: 0,
  questionTypeVersionId: '00000000-0000-4000-8000-000000000003',
  payloadState: 'CANONICAL' as const,
  topicId: '00000000-0000-4000-8000-000000000004',
  difficulty: 3,
  payload: { blocks: [], tagSlugs: [] },
  resultGroup: 'NORMAL' as const,
  reviewStatus: 'PENDING' as const,
  reviewCode: null,
  regeneratedFromCandidateId: null,
  approvedQuestionId: null,
  approvedQuestionVersionId: null,
  revision: 0,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
};

const createDatabase = (results: Array<Array<Record<string, unknown>>>) => {
  const queue = [...results];
  const selectedFields: string[][] = [];
  const innerJoin = vi.fn();
  const select = vi.fn((fields: Record<string, unknown>) => {
    selectedFields.push(Object.keys(fields));
    const consume = () => Promise.resolve(queue.shift() ?? []);
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn((...input: unknown[]) => {
        innerJoin(...input);
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => consume()),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => consume().then(resolve, reject),
    };
    return chain;
  });
  return { database: { select }, selectedFields, innerJoin };
};

describe('DrizzleQuestionCandidateQuery', () => {
  it('목록은 private hash 없이 stable page를 반환한다', async () => {
    const fake = createDatabase([[{ totalItems: 1 }], [candidate]]);
    const query = new DrizzleQuestionCandidateQuery(fake.database as never);

    await expect(
      query.list({
        jobId: candidate.jobId,
        resultGroup: 'NORMAL',
        reviewStatus: 'PENDING',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [{ ...candidate, tagIds: [] }],
      totalItems: 1,
    });
    expect(fake.selectedFields[1]).not.toContain('payloadHash');
    expect(fake.selectedFields[1]).toContain('jobId');
    expect(fake.innerJoin).toHaveBeenCalledTimes(2);
  });

  it('상세는 canonical payload와 allow-list validation만 함께 반환한다', async () => {
    const validation = {
      stage: 'SCHEMA',
      status: 'PASSED',
      code: null,
      details: {},
      createdAt: new Date('2026-07-28T00:00:01.000Z'),
    };
    const fake = createDatabase([[candidate], [validation]]);
    const query = new DrizzleQuestionCandidateQuery(fake.database as never);

    await expect(query.findById(candidate.id)).resolves.toEqual({
      candidate: { ...candidate, tagIds: [] },
      validations: [validation],
    });
    expect(fake.selectedFields.flat()).not.toContain('payloadHash');
    expect(fake.selectedFields[0]).toContain('jobId');
    expect(fake.innerJoin).toHaveBeenCalledOnce();
  });

  it('비활성 여부와 무관하게 payload tag slug 순서대로 truthful ID를 복원한다', async () => {
    const firstTagId = '00000000-0000-4000-8000-000000000010';
    const secondTagId = '00000000-0000-4000-8000-000000000011';
    const tagged = {
      ...candidate,
      payload: { blocks: [], tagSlugs: ['tone', 'exam'] },
    };
    const fake = createDatabase([
      [tagged],
      [
        { id: secondTagId, slug: 'exam' },
        { id: firstTagId, slug: 'tone' },
      ],
      [],
    ]);
    const query = new DrizzleQuestionCandidateQuery(fake.database as never);

    await expect(query.findById(candidate.id)).resolves.toMatchObject({
      candidate: {
        payloadState: 'CANONICAL',
        tagIds: [firstTagId, secondTagId],
      },
    });
  });

  it('canonical tag slug 하나라도 없으면 private 값 없는 data integrity 오류로 fail-closed한다', async () => {
    const tagged = {
      ...candidate,
      payload: { blocks: [], tagSlugs: ['missing'] },
    };
    const fake = createDatabase([[tagged], [], []]);
    const query = new DrizzleQuestionCandidateQuery(fake.database as never);

    await expect(query.findById(candidate.id)).rejects.toEqual(
      new QuestionCandidateDataIntegrityError(),
    );
  });
});
