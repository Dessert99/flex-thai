import { describe, expect, it, vi } from 'vitest';
import { DrizzleLearnerQuestionQuery } from './drizzle-learner-question.query.js';
describe('문제 조회의 정답 비노출', () => {
  it('제출 전 상세 SELECT에는 정답과 해설이 없다', async () => {
    let fields: Record<string, unknown> = {};
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => Promise.resolve([])),
      limit: vi.fn(() => Promise.resolve([])),
    };
    const database = {
      select: vi.fn((selection: Record<string, unknown>) => {
        fields = selection;
        return chain;
      }),
    };
    expect(
      await new DrizzleLearnerQuestionQuery(
        database as never,
      ).getQuestionDetail('user', 'question'),
    ).toBeNull();
    expect(Object.keys(fields)).toEqual(
      expect.arrayContaining(['prompt', 'options', 'questionVersion']),
    );
    expect(fields).not.toHaveProperty('correctOptionId');
    expect(fields).not.toHaveProperty('explanation');
  });
});
