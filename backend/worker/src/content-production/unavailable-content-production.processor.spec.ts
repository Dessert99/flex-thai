/** 운영 provider 미구성 시 콘텐츠 제작 결과가 실패로 고정되는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { UnavailableContentProductionProcessor } from './unavailable-content-production.processor.js';

describe('UnavailableContentProductionProcessor 운영 안전 경계', () => {
  it('실제 provider가 없으면 거짓 성공 없이 재시도 불가 실패를 반환한다', async () => {
    const processor = new UnavailableContentProductionProcessor();

    await expect(processor.process()).resolves.toEqual({
      status: 'FAILED',
      retryable: false,
      errorCode: 'CONTENT_PRODUCTION_PROVIDER_UNAVAILABLE',
    });
  });
});
