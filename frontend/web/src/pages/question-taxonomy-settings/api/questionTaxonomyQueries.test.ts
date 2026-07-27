/** 문제 분류 설정 mutation의 HTTP 응답 계약을 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addApprovedExample,
  replaceDifficultyCriteria,
} from './questionTaxonomyQueries';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

const versionId = '00000000-0000-4000-8000-000000000001';
const mediaAssetId = '00000000-0000-4000-8000-000000000002';
const sentence = {
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  mediaAssetId,
  tokens: [],
  expressions: [],
};

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue(undefined);
});

describe('문제 분류 설정 mutation', () => {
  it('난이도 기준 교체의 빈 성공 응답을 JSON으로 해석하지 않는다', async () => {
    const input = {
      criteria: [1, 2, 3, 4, 5].map((difficulty) => ({
        difficulty,
        criteria: `${difficulty}단계`,
      })),
    };

    await replaceDifficultyCriteria({ versionId, input });

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      body: input,
      method: 'PUT',
      path: `/admin/question-type-versions/${versionId}/difficulty-criteria`,
      response: { kind: 'empty' },
    });
  });

  it('승인 예시 추가의 빈 성공 응답을 JSON으로 해석하지 않는다', async () => {
    const input = {
      title: '기본 예시',
      payload: {
        questionTypeSlug: 'reading-vocabulary',
        questionTypeVersion: 1,
        difficulty: 3,
        topicSlug: 'general',
        tagSlugs: [],
        blocks: [
          {
            kind: 'QUESTION' as const,
            displayMode: 'TEXT' as const,
            sentences: [{ speaker: null, sentence }],
          },
        ],
        options: ['a', 'b', 'c', 'd'].map((clientRef, position) => ({
          clientRef,
          position,
          sentence,
          span: null,
        })),
        correctOptionRef: 'a',
      },
    };

    await addApprovedExample({ versionId, input });

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      body: input,
      method: 'POST',
      path: `/admin/question-type-versions/${versionId}/examples`,
      response: { kind: 'empty' },
    });
  });
});
