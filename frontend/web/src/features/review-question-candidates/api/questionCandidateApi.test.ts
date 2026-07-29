/** 후보 command의 fresh requestId·revision·DELETE body를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import {
  approveQuestionCandidate,
  discardQuestionCandidate,
} from './questionCandidateApi';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const candidateId = '00000000-0000-4000-8000-000000000001';
const requestIds = [
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
] as const;

describe('questionCandidateApi', () => {
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
});
