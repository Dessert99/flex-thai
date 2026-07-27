/** 외부 비용 없는 processor가 sourceRef로 성공·검토·실패를 결정적으로 재현하는지 검증한다 */
import type { ContentProductionWorkItem } from '@flex-thia/domain';
import { describe, expect, it } from 'vitest';
import { DeterministicContentProductionProcessor } from './deterministic-content-production.processor.js';

const workItem = (sourceRef: string): ContentProductionWorkItem => ({
  jobId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
  jobAttempt: 0,
  requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
  purpose: 'VOCABULARY_EXTRACTION',
  presetSnapshot: {
    id: 'a9979e5d-515d-43ab-a380-e88b78513c38',
    name: '로컬 어휘 추출',
    purpose: 'VOCABULARY_EXTRACTION',
    version: 1,
    parameters: {},
  },
  item: {
    id: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
    sourceRef,
    jobInputId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
    operation: 'VOCABULARY_EXTRACTION',
    status: 'PROCESSING',
    attempt: 0,
    retryable: false,
    errorCode: null,
    leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
    leaseToken: 'lease-token',
  },
  input: {
    jobInputId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
    ordinal: 0,
    uploadId: '5d024629-f887-4fae-ad46-20dc24d6de7d',
    inputType: 'TEXT',
    inputKey: 'inputs/local/0',
    sizeBytes: 10,
  },
});

describe('DeterministicContentProductionProcessor local 처리', () => {
  it('sourceRef 입력 순서로 부분 실패와 검토 필요 결과를 재현한다', async () => {
    const processor = new DeterministicContentProductionProcessor();
    const signal = new AbortController().signal;

    await expect(
      processor.process(workItem('input:0'), signal),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      retryable: false,
    });
    await expect(
      processor.process(workItem('input:1:question'), signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: false,
    });
    await expect(
      processor.process(workItem('input:2:vocabulary'), signal),
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: true,
      errorCode: 'LOCAL_FAKE_FAILURE',
    });
  });

  it('취소된 lease의 항목 처리를 시작하지 않는다', async () => {
    const processor = new DeterministicContentProductionProcessor();
    const controller = new AbortController();
    controller.abort(new Error('lease lost'));

    await expect(
      processor.process(workItem('input:0'), controller.signal),
    ).rejects.toThrow('lease lost');
  });
});
