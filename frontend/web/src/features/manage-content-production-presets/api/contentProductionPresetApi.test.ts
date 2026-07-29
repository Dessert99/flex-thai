/** preset command의 requestId와 optimistic revision 전달을 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import { setContentProductionPresetEnabled } from './contentProductionPresetApi';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const presetId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';

describe('contentProductionPresetApi', () => {
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
});
