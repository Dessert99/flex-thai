/** 후보 command의 fresh requestId·revision·DELETE body를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import {
  approveQuestionCandidate,
  discardQuestionCandidate,
  questionCandidateQueryOptions,
  questionCandidatesQueryOptions,
  regenerateQuestionCandidate,
} from './questionCandidateApi';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const candidateId = '00000000-0000-4000-8000-000000000001';
const requestIds = [
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
] as const;

describe('문제 후보 API', () => {
  beforeEach(() => {
    vi.mocked(authenticatedRequest).mockReset();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(requestIds[0])
      .mockReturnValueOnce(requestIds[1]);
  });

  it('매 command에 fresh UUID와 현재 revision을 담는다', () => {
    void approveQuestionCandidate(candidateId, 4);
    void discardQuestionCandidate(candidateId, 5);
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: { expectedRevision: 4, requestId: requestIds[0] },
      }),
    );
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'DELETE',
        body: { expectedRevision: 5, requestId: requestIds[1] },
      }),
    );
  });

  it('목록 filter와 상세 UUID를 각각 query path에 보존한다', async () => {
    const signal = new AbortController().signal;
    const list = questionCandidatesQueryOptions({
      page: 2,
      pageSize: 10,
      reviewStatus: 'PENDING',
    });
    const detail = questionCandidateQueryOptions(candidateId);
    if (!list.queryFn || !detail.queryFn) {
      throw new Error('QUESTION_CANDIDATE_QUERY_FUNCTION_REQUIRED');
    }

    await list.queryFn({ signal } as never);
    await detail.queryFn({ signal } as never);

    const listRequest: unknown =
      vi.mocked(authenticatedRequest).mock.calls[0]?.[0];
    const detailRequest: unknown =
      vi.mocked(authenticatedRequest).mock.calls[1]?.[0];
    expect(listRequest).toMatchObject({
      path: '/admin/content-production/question-candidates?reviewStatus=PENDING&page=2&pageSize=10',
      signal,
    });
    expect(detailRequest).toMatchObject({
      path: `/admin/content-production/question-candidates/${candidateId}`,
      signal,
    });
  });

  it('재생성은 현재 revision과 fresh requestId를 POST body로 보낸다', () => {
    void regenerateQuestionCandidate(candidateId, 7);

    const request: unknown = vi.mocked(authenticatedRequest).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      body: { expectedRevision: 7, requestId: requestIds[0] },
      method: 'POST',
      path: `/admin/content-production/question-candidates/${candidateId}/regenerate`,
    });
  });
});
