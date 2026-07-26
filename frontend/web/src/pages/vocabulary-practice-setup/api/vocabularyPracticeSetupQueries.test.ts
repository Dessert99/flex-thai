/** 단어 연습 설정 query의 캐시 키·검색 활성화·인증 요청을 검증한다 */
import {
  vocabularyListResponseSchema,
  wordbookListResponseSchema,
} from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/shared/test';
import {
  practiceVocabularySearchQueryOptions,
  practiceWordbooksQueryOptions,
} from './vocabularyPracticeSetupQueries';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어 연습 설정 query', () => {
  it('사용자 단어장을 학습자 캐시 키로 조회한다', async () => {
    const response = {
      items: [
        {
          id: '00000000-0000-4000-8000-000000000301',
          name: 'FLEX 어휘',
          itemCount: 3,
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
        },
      ],
    };
    mocks.authenticatedRequest.mockResolvedValue(response);
    const options = practiceWordbooksQueryOptions();

    await expect(createTestQueryClient().fetchQuery(options)).resolves.toEqual(
      response,
    );
    expect(options.queryKey).toEqual(['learner', 'wordbooks']);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      path: '/me/wordbooks',
      response: { kind: 'json', schema: wordbookListResponseSchema },
    });
  });

  it('공백 검색은 비활성화하고 원문 query를 캐시 키에 보존한다', () => {
    const options = practiceVocabularySearchQueryOptions('   ');

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual([
      'learner',
      'vocabularies',
      'practice',
      '   ',
    ]);
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
  });

  it('검색어를 URL 인코딩해 첫 100개 공용 어휘를 조회한다', async () => {
    const response = {
      items: [],
      page: {
        page: 1,
        pageSize: 100,
        totalItems: 0,
        totalPages: 0,
      },
    };
    mocks.authenticatedRequest.mockResolvedValue(response);
    const options = practiceVocabularySearchQueryOptions('ไป กิน');

    await expect(createTestQueryClient().fetchQuery(options)).resolves.toEqual(
      response,
    );
    expect(options.enabled).toBe(true);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      path: '/vocabularies?page=1&pageSize=100&query=%E0%B9%84%E0%B8%9B%20%E0%B8%81%E0%B8%B4%E0%B8%99',
      response: { kind: 'json', schema: vocabularyListResponseSchema },
    });
  });
});
