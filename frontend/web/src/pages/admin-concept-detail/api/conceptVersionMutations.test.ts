/** 관리자 개념 버전·노출 mutation의 method와 path를 검증한다 */
import {
  conceptValidationReportSchema,
  conceptVersionResponseSchema,
} from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeConceptVisibility,
  createNextConceptDraft,
  publishConceptVersion,
  replaceConceptVersion,
  validateConceptVersion,
} from './conceptVersionMutations';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

const conceptId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue(undefined);
});

describe('개념 버전 mutation', () => {
  it.each([
    {
      label: '다음 초안',
      run: () => createNextConceptDraft(conceptId),
      request: {
        method: 'POST',
        path: `/admin/concepts/${conceptId}/versions`,
        response: { kind: 'json', schema: conceptVersionResponseSchema },
      },
    },
    {
      label: '검증',
      run: () => validateConceptVersion(versionId),
      request: {
        method: 'POST',
        path: `/admin/concept-versions/${versionId}/validate`,
        response: {
          kind: 'json',
          schema: conceptValidationReportSchema,
        },
      },
    },
    {
      label: '게시',
      run: () => publishConceptVersion(versionId),
      request: {
        method: 'POST',
        path: `/admin/concept-versions/${versionId}/publish`,
        response: { kind: 'empty' },
      },
    },
  ])('$label action을 계약된 endpoint로 보낸다', async ({ request, run }) => {
    await run();
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(request);
  });

  it.each(['hide', 'restore'] as const)(
    '%s 공개 상태 action을 개념 endpoint로 보낸다',
    async (action) => {
      await changeConceptVisibility(conceptId, action);
      expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
        method: 'POST',
        path: `/admin/concepts/${conceptId}/${action}`,
        response: { kind: 'empty' },
      });
    },
  );

  it('revision과 전체 block payload를 버전 교체 요청에 보낸다', async () => {
    const payload = {
      revision: 2,
      category: 'GRAMMAR' as const,
      position: 1,
      title: '기본 어순',
      summary: '주어와 서술어 순서',
      blocks: [
        {
          kind: 'EXPLANATION' as const,
          position: 0,
          heading: '설명',
          paragraphs: ['본문'],
        },
      ],
    };

    await replaceConceptVersion(versionId, payload);

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      body: payload,
      method: 'PUT',
      path: `/admin/concept-versions/${versionId}`,
      response: { kind: 'json', schema: conceptVersionResponseSchema },
    });
  });

  it('잘못된 version UUID는 네트워크 요청 전에 거부한다', () => {
    expect(() => publishConceptVersion('draft-version')).toThrow();
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
  });
});
