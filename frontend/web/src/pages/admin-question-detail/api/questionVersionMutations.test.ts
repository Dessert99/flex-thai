/** 관리자 문제 버전 mutation의 멱등 요청 경계를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { regenerateQuestionVersionTts } from './questionVersionMutations';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('문제 버전 TTS mutation', () => {
  it('사용자 action이 만든 request ID를 X-Request-ID header로 전송한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      jobIds: [],
      scheduledSentenceCount: 0,
      reusedReadySentenceCount: 1,
    });
    const requestId = '01933b6a-8f13-7a19-b7e5-536d70f57aad';

    await regenerateQuestionVersionTts({
      questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
      versionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
      requestId,
    });

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'X-Request-ID': requestId },
        method: 'POST',
      }),
    );
  });
});
