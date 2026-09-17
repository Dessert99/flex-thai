import { describe, expect, it } from 'vitest';
import {
  questionDetailResponseSchema,
  questionListQuerySchema,
  submitQuestionAttemptRequestSchema,
} from './questions.js';
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const detail = {
  questionId: id,
  questionVersion: 2,
  questionType: { id, slug: 'reading', displayName: '읽기' },
  skill: 'READING',
  difficulty: 2,
  passage: null,
  prompt: 'คำถาม',
  options: [
    { id, text: 'ก' },
    { id: other, text: 'ข' },
  ],
  saved: false,
  firstResult: 'UPDATED',
};
describe('문제 공개 계약', () => {
  it('수정됨 상태와 본문·보기 텍스트를 허용한다', () => {
    expect(questionDetailResponseSchema.parse(detail)).toEqual(detail);
  });
  it('제출 전 정답과 해설 노출을 거부한다', () => {
    expect(
      questionDetailResponseSchema.safeParse({ ...detail, correctOptionId: id })
        .success,
    ).toBe(false);
    expect(
      questionDetailResponseSchema.safeParse({ ...detail, explanation: '해설' })
        .success,
    ).toBe(false);
  });
  it('숫자 문제 버전을 요구하고 클라이언트 채점 결과를 받지 않는다', () => {
    const input = {
      questionVersion: 2,
      selectedOptionId: id,
      clientAttemptId: other,
      durationMs: 1000,
    };
    expect(submitQuestionAttemptRequestSchema.parse(input)).toEqual(input);
    expect(
      submitQuestionAttemptRequestSchema.safeParse({
        ...input,
        isCorrect: true,
      }).success,
    ).toBe(false);
    expect(
      submitQuestionAttemptRequestSchema.safeParse({
        ...input,
        questionVersion: id,
      }).success,
    ).toBe(false);
  });
  it('수정된 문제 목록 필터를 허용한다', () => {
    expect(
      questionListQuerySchema.parse({ firstResult: 'UPDATED' }).firstResult,
    ).toBe('UPDATED');
  });
});
