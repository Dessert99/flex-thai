/** 외부 비용 없는 processor가 sourceRef로 성공·검토·실패를 결정적으로 재현하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { DeterministicContentProductionProcessor } from './deterministic-content-production.processor.js';

const item = (sourceRef: string) => ({
  id: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
  sourceRef,
  status: 'PROCESSING' as const,
  attempt: 0,
  retryable: false,
  errorCode: null,
  leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
  leaseToken: 'lease-token',
});

describe('DeterministicContentProductionProcessor local 처리', () => {
  it('sourceRef 입력 순서로 부분 실패와 검토 필요 결과를 재현한다', async () => {
    const processor = new DeterministicContentProductionProcessor();

    await expect(processor.process(item('input:0'))).resolves.toMatchObject({
      status: 'SUCCEEDED',
      retryable: false,
    });
    await expect(
      processor.process(item('input:1:question')),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: false,
    });
    await expect(
      processor.process(item('input:2:vocabulary')),
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: true,
      errorCode: 'LOCAL_FAKE_FAILURE',
    });
  });
});
