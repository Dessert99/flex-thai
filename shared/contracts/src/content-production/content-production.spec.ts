/** 콘텐츠 제작 공개 계약의 입력 일관성과 내부 정보 비공개를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  contentProductionJobDetailResponseSchema,
  createContentProductionJobRequestSchema,
  uploadPolicyRequestSchema,
} from './content-production.js';

describe('콘텐츠 제작 공개 계약', () => {
  it('생성 목적과 preset을 포함한 작업 요청을 검증한다', () => {
    expect(
      createContentProductionJobRequestSchema.parse({
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
        presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
      }),
    ).toEqual({
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
      presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
      uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
    });
  });

  it('upload 입력 타입별 허용 MIME 선언을 검증한다', () => {
    expect(
      uploadPolicyRequestSchema.safeParse({
        inputType: 'PDF',
        contentType: 'text/plain',
        declaredSizeBytes: 1024,
      }).success,
    ).toBe(false);
  });

  it('작업 상세 응답에서 storage key와 provider 원문을 제거한다', () => {
    const parsed = contentProductionJobDetailResponseSchema.parse({
      id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
      purpose: 'VOCABULARY_EXTRACTION',
      status: 'COMPLETED_WITH_FAILURES',
      attempt: 1,
      createdAt: '2026-07-27T00:00:00.000Z',
      completedAt: '2026-07-27T00:01:00.000Z',
      counts: {
        total: 2,
        succeeded: 1,
        needsAttention: 0,
        failed: 1,
      },
      presetSnapshot: {
        id: 'a9979e5d-515d-43ab-a380-e88b78513c38',
        name: '기본 어휘 추출',
        purpose: 'VOCABULARY_EXTRACTION',
        version: 1,
        parameters: { language: 'th' },
      },
      inputs: [
        {
          uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
          inputType: 'PDF',
          sizeBytes: 1024,
          storageKey: 'inputs/private.pdf',
        },
      ],
      items: [
        {
          id: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
          status: 'FAILED',
          attempt: 1,
          retryable: true,
          errorCode: 'LOCAL_FAKE_FAILURE',
          providerResponse: { secret: true },
        },
      ],
    });

    expect(JSON.stringify(parsed)).not.toContain('storageKey');
    expect(JSON.stringify(parsed)).not.toContain('providerResponse');
  });
});
