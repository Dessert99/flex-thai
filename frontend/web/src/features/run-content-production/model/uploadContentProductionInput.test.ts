/** 콘텐츠 제작 upload의 policy·presigned·complete 순서를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import { uploadContentProductionInput } from './uploadContentProductionInput';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const uploadId = '00000000-0000-4000-8000-000000000001';

describe('uploadContentProductionInput', () => {
  beforeEach(() => {
    vi.mocked(authenticatedRequest).mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('인증 policy 뒤 인증 header 없는 form을 보내고 완료 검증을 요청한다', async () => {
    vi.mocked(authenticatedRequest)
      .mockResolvedValueOnce({
        uploadId,
        url: 'https://uploads.example.test',
        fields: { key: 'private/input' },
        expiresAt: '2026-07-28T01:00:00.000Z',
      })
      .mockResolvedValueOnce({
        uploadId,
        inputType: 'TEXT',
        sizeBytes: 3,
        status: 'VERIFIED',
      });
    const result = await uploadContentProductionInput(
      new File(['abc'], 'input.txt', { type: 'text/plain' }),
      new AbortController().signal,
    );
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: '/admin/content-production/uploads/policies',
        body: expect.objectContaining({ inputType: 'TEXT' }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://uploads.example.test',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: `/admin/content-production/uploads/${uploadId}/complete`,
      }),
    );
    expect(result.status).toBe('VERIFIED');
  });

  it('지원하지 않는 MIME은 policy 요청 전에 거부한다', async () => {
    await expect(
      uploadContentProductionInput(
        new File(['abc'], 'input.csv', { type: 'text/csv' }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('CONTENT_PRODUCTION_INPUT_TYPE_UNSUPPORTED');
    expect(authenticatedRequest).not.toHaveBeenCalled();
  });
});
