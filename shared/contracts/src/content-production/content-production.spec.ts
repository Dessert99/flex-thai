/** 콘텐츠 제작 공개 계약의 입력 일관성과 내부 정보 비공개를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  contentProductionJobConfigurationSchema,
  contentProductionJobDetailResponseSchema,
  createContentProductionJobRequestSchema,
  uploadPolicyRequestSchema,
} from './content-production.js';

const questionTypeVersionId = 'cbb22737-6f3d-4112-bb0e-8e4f005c810b';
const targetVocabularyId = 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6';
const validQuestionOptions = {
  questionTypePlan: [{ questionTypeVersionId, count: 2 }],
  difficultyPlan: [
    { difficulty: 2, count: 1 },
    { difficulty: 3, count: 1 },
  ],
  targetVocabularyIds: [targetVocabularyId],
  requiredVocabularyIds: [],
  excludedVocabularyIds: [],
  newAuxiliaryVocabularyLimit: 10,
  similarityThreshold: 0.7,
  additionalInstructionKo: ' 짧고 명확하게 출제해 주세요. ',
};

describe('콘텐츠 제작 공개 계약', () => {
  it('어휘 추출 목적은 문제 전용 옵션을 거절한다', () => {
    expect(
      contentProductionJobConfigurationSchema.parse({
        purpose: 'VOCABULARY_EXTRACTION',
        presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        options: {},
      }),
    ).toMatchObject({ purpose: 'VOCABULARY_EXTRACTION', options: {} });
    expect(
      contentProductionJobConfigurationSchema.safeParse({
        purpose: 'VOCABULARY_EXTRACTION',
        presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        options: validQuestionOptions,
      }).success,
    ).toBe(false);
  });

  it('한 작업의 upload ID는 100개까지만 허용한다', () => {
    expect(
      createContentProductionJobRequestSchema.safeParse({
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'VOCABULARY_EXTRACTION',
        presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        uploadIds: Array.from(
          { length: 101 },
          (_, index) =>
            `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ),
        options: {},
      }).success,
    ).toBe(false);
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
    const privateResponse = {
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
        parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
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
    };

    expect(
      contentProductionJobDetailResponseSchema.safeParse(privateResponse)
        .success,
    ).toBe(false);
    const parsed = contentProductionJobDetailResponseSchema.parse({
      ...privateResponse,
      inputs: privateResponse.inputs.map(({ storageKey, ...input }) => {
        void storageKey;
        return input;
      }),
      items: privateResponse.items.map(({ providerResponse, ...item }) => {
        void providerResponse;
        return item;
      }),
    });
    expect(JSON.stringify(parsed)).not.toContain('storageKey');
    expect(JSON.stringify(parsed)).not.toContain('providerResponse');
  });
});
