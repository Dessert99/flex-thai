/** preset command의 requestId와 optimistic revision 전달을 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import {
  contentProductionPresetVersionsQueryOptions,
  createContentProductionPreset,
  createContentProductionPresetVersion,
  setContentProductionPresetEnabled,
} from './contentProductionPresetApi';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const presetId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const nextRequestId = '00000000-0000-4000-8000-000000000003';

describe('콘텐츠 제작 preset API', () => {
  beforeEach(() => {
    vi.mocked(authenticatedRequest).mockReset();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(requestId);
  });

  it('표시된 revision과 fresh requestId로 enabled 상태를 변경한다', () => {
    void setContentProductionPresetEnabled(presetId, false, 6);
    expect(authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/admin/content-production/presets/${presetId}/enabled`,
        body: {
          enabled: false,
          expectedRevision: 6,
          requestId,
        },
      }),
    );
  });

  it('version 목록 query가 인증 signal과 endpoint를 전달한다', async () => {
    const signal = new AbortController().signal;
    const options = contentProductionPresetVersionsQueryOptions();
    if (!options.queryFn) {
      throw new Error('CONTENT_PRODUCTION_PRESET_QUERY_FUNCTION_REQUIRED');
    }

    await options.queryFn({ signal } as never);

    expect(authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/admin/content-production/preset-versions',
        signal,
      }),
    );
  });

  it('최초 version과 다음 version에 각각 fresh requestId를 넣는다', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReset()
      .mockReturnValueOnce(requestId)
      .mockReturnValueOnce(nextRequestId);
    void createContentProductionPreset({
      name: '어휘 추출',
      purpose: 'VOCABULARY_EXTRACTION',
      parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
    });
    void createContentProductionPresetVersion(presetId, {
      purpose: 'VOCABULARY_EXTRACTION',
      parameters: { suspectedDuplicateMaxCodePointDistance: 2 },
    });

    const firstRequest: unknown =
      vi.mocked(authenticatedRequest).mock.calls[0]?.[0];
    const secondRequest: unknown =
      vi.mocked(authenticatedRequest).mock.calls[1]?.[0];
    expect(firstRequest).toMatchObject({
      body: { requestId, name: '어휘 추출' },
      path: '/admin/content-production/presets',
    });
    expect(secondRequest).toMatchObject({
      body: {
        requestId: nextRequestId,
        parameters: { suspectedDuplicateMaxCodePointDistance: 2 },
      },
      path: `/admin/content-production/presets/${presetId}/versions`,
    });
  });
});
