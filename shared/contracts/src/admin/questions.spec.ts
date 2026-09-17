import { describe, expect, it } from 'vitest';
import {
  adminQuestionPayloadSchema,
  adminQuestionUpdateRequestSchema,
} from './questions.js';
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const payload = {
  typeVersionId: id,
  topicId: id,
  tagIds: [],
  difficulty: 2,
  passage: null,
  prompt: '문제',
  options: [
    { id, text: '가' },
    { id: other, text: '나' },
  ],
  correctOptionId: id,
  explanation: '해설',
  vocabularies: [
    { vocabularyId: id, meaningId: null, role: 'TARGET', occurrenceCount: 2 },
  ],
};
describe('문제 편집 계약', () => {
  it('보기 밖 정답과 같은 어휘의 중복 사용 행을 거부한다', () => {
    expect(
      adminQuestionPayloadSchema.safeParse({
        ...payload,
        options: [
          { id: other, text: '나' },
          { id: other, text: '다' },
        ],
      }).success,
    ).toBe(false);
    expect(
      adminQuestionPayloadSchema.safeParse({
        ...payload,
        vocabularies: [...payload.vocabularies, ...payload.vocabularies],
      }).success,
    ).toBe(false);
  });
  it('정수 등장 횟수와 수정 충돌 확인 시각을 요구한다', () => {
    expect(
      adminQuestionPayloadSchema.safeParse({
        ...payload,
        vocabularies: [{ ...payload.vocabularies[0], occurrenceCount: 1.5 }],
      }).success,
    ).toBe(false);
    expect(
      adminQuestionUpdateRequestSchema.safeParse({
        input: payload,
        expectedVersion: 1,
        requiresRetry: true,
      }).success,
    ).toBe(false);
    expect(
      adminQuestionUpdateRequestSchema.parse({
        input: payload,
        expectedVersion: 1,
        expectedUpdatedAt: '2026-09-17T00:00:00Z',
        requiresRetry: true,
      }).input,
    ).toEqual(payload);
  });
});
