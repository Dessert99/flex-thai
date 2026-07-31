/** 어휘 후보 상세 Container의 stale revision 복구와 query 무효화를 검증한다 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { createTestQueryClient, renderWithProviders } from '@/shared/test';
import { VocabularyCandidateDetailPageContainer } from './VocabularyCandidateDetailPageContainer';

const candidateId = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000002';
const requests = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: requests.authenticatedRequest };
});

beforeEach(() => {
  requests.authenticatedRequest.mockReset().mockImplementation(({ method }) => {
    if (method === 'DELETE') return Promise.reject(createConflictError());
    return Promise.resolve(detail);
  });
});

describe('어휘 후보 상세 Container', () => {
  it('409 뒤 목록·상세·작업 query를 다시 읽고 최신 후보 확인을 안내한다', async () => {
    const queryClient = createTestQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(
      <VocabularyCandidateDetailPageContainer candidateId={candidateId} />,
      { queryClient },
    );
    await screen.findByRole('heading', { name: 'สวัสดี' });

    fireEvent.click(screen.getByRole('button', { name: '후보 폐기' }));

    expect(
      await screen.findByText(
        '다른 검수자가 먼저 변경했습니다. 최신 후보를 다시 확인해 주세요.',
      ),
    ).toBeVisible();
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['admin', 'content-production', 'vocabulary-candidates'],
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: [
          'admin',
          'content-production',
          'vocabulary-candidates',
          candidateId,
        ],
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['admin', 'content-production', 'jobs', jobId],
      });
    });
  });
});

function createConflictError() {
  return new ApiError({
    kind: 'problem',
    problem: {
      code: 'VOCABULARY_CANDIDATE_REVIEW_CONFLICT',
      fieldErrors: [],
      requestId: 'request-id',
      status: 409,
      title: 'Conflict',
      type: 'about:blank',
    },
  });
}

const detail = {
  candidate: {
    id: candidateId,
    jobId,
    jobItemId: '00000000-0000-4000-8000-000000000003',
    jobAttempt: 1,
    ordinal: 0,
    thai: 'สวัสดี',
    kind: 'WORD' as const,
    meanings: [
      { meaningKo: '안녕하세요', partOfSpeech: '감탄사', difficulty: 1 },
    ],
    classification: 'NEW_VOCABULARY' as const,
    resultGroup: 'NORMAL' as const,
    matchedVocabularyId: null,
    suspectedMatches: [],
    review: { status: 'PENDING' as const, revision: 0, resolution: null },
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  },
  validations: [
    {
      stage: 'SCHEMA' as const,
      status: 'PASSED' as const,
      code: null,
      evidence: {},
      createdAt: '2026-07-31T00:00:01.000Z',
    },
  ],
};
