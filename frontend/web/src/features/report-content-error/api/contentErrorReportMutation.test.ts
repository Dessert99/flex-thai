/** 학습자 오류 신고 API adapter의 요청 계약을 검증한다 */
import { createContentErrorReportResponseSchema } from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitContentErrorReport } from './contentErrorReportMutation';

const authenticatedRequest = vi.hoisted(() => vi.fn());

vi.mock('@/shared/api', () => ({ authenticatedRequest }));

beforeEach(() => {
  authenticatedRequest.mockReset().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    status: 'OPEN',
    createdAt: '2026-07-26T00:00:00.000Z',
  });
});

describe('학습자 오류 신고 API', () => {
  it('origin·분류·설명을 생성 endpoint와 응답 계약에 전달한다', async () => {
    const body = {
      origin: {
        kind: 'SENTENCE' as const,
        sentenceVersionId: '00000000-0000-4000-8000-000000000002',
        tokenPosition: 1,
      },
      category: 'TOKENIZATION' as const,
      description: '두 번째 토큰 경계가 다릅니다.',
    };

    await submitContentErrorReport(body);

    expect(authenticatedRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/content-error-reports',
      body,
      response: {
        kind: 'json',
        schema: createContentErrorReportResponseSchema,
      },
    });
  });
});
