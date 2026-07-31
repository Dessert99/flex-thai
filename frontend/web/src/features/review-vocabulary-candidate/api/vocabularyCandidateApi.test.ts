import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import {
  approveVocabularyCandidate,
  discardVocabularyCandidate,
  vocabularyCandidateQueryOptions,
  vocabularyCandidatesQueryOptions,
} from './vocabularyCandidateApi';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const candidateId = '00000000-0000-4000-8000-000000000001';
const requestIds = [
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
] as const;

describe('어휘 후보 API', () => {
  beforeEach(() => {
    vi.mocked(authenticatedRequest).mockReset();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(requestIds[0])
      .mockReturnValueOnce(requestIds[1]);
  });

  it('status·job·page filter와 상세 UUID를 query path에 보존한다', async () => {
    const signal = new AbortController().signal;
    const list = vocabularyCandidatesQueryOptions({
      jobId: '00000000-0000-4000-8000-000000000004',
      reviewStatus: 'PENDING',
      page: 2,
      pageSize: 10,
    });
    const detail = vocabularyCandidateQueryOptions(candidateId);
    if (!list.queryFn || !detail.queryFn) {
      throw new Error('VOCABULARY_CANDIDATE_QUERY_FUNCTION_REQUIRED');
    }

    await list.queryFn({ signal } as never);
    await detail.queryFn({ signal } as never);

    expect(vi.mocked(authenticatedRequest).mock.calls[0]?.[0]).toMatchObject({
      path: '/admin/content-production/vocabulary-candidates?jobId=00000000-0000-4000-8000-000000000004&reviewStatus=PENDING&page=2&pageSize=10',
      signal,
    });
    expect(vi.mocked(authenticatedRequest).mock.calls[1]?.[0]).toMatchObject({
      path: `/admin/content-production/vocabulary-candidates/${candidateId}`,
      signal,
    });
  });

  it('승인·폐기는 매번 fresh requestId와 현재 revision을 보낸다', () => {
    void approveVocabularyCandidate(candidateId, 3, {
      action: 'LINK_EXISTING',
      vocabularyId: '00000000-0000-4000-8000-000000000005',
    });
    void discardVocabularyCandidate(candidateId, 4);

    expect(vi.mocked(authenticatedRequest).mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      body: {
        action: 'LINK_EXISTING',
        vocabularyId: '00000000-0000-4000-8000-000000000005',
        expectedRevision: 3,
        requestId: requestIds[0],
      },
    });
    expect(vi.mocked(authenticatedRequest).mock.calls[1]?.[0]).toMatchObject({
      method: 'DELETE',
      body: { expectedRevision: 4, requestId: requestIds[1] },
    });
  });
});
