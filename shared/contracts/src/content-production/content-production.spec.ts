/** 콘텐츠 제작 공개 계약의 입력 일관성과 내부 정보 비공개를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  contentProductionJobConfigurationSchema,
  contentProductionJobDetailResponseSchema,
  contentProductionQuestionOptionsSchema,
  createContentProductionJobRequestSchema,
  promptPreviewRequestSchema,
  setContentProductionPresetEnabledRequestSchema,
  uploadPolicyRequestSchema,
} from './content-production.js';

const questionTypeVersionId = 'cbb22737-6f3d-4112-bb0e-8e4f005c810b';
const voicePresetId = 'eb16b18a-8d19-4c83-9cdb-c36a5d59c4d6';
const targetVocabularyId = 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6';
const validQuestionOptions = {
  questionCount: 2,
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
  defaultVoicePresetId: voicePresetId,
  speakerVoiceAssignments: [
    { speakerRole: ' 진행자 ', voicePresetId },
  ],
  additionalInstructionKo: ' 짧고 명확하게 출제해 주세요. ',
};

describe('콘텐츠 제작 공개 계약', () => {
  it('생성 목적과 preset을 포함한 작업 요청을 검증한다', () => {
    expect(
      createContentProductionJobRequestSchema.parse({
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
        presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
        options: validQuestionOptions,
      }),
    ).toMatchObject({
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
      presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
      uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
      options: {
        ...validQuestionOptions,
        speakerVoiceAssignments: [
          { speakerRole: '진행자', voicePresetId },
        ],
        additionalInstructionKo: '짧고 명확하게 출제해 주세요.',
      },
    });
  });

  it('문제 생성 옵션의 범위·합계·집합을 엄격하게 검증한다', () => {
    expect(contentProductionQuestionOptionsSchema.parse(validQuestionOptions))
      .toMatchObject({
        questionCount: 2,
        additionalInstructionKo: '짧고 명확하게 출제해 주세요.',
      });
    for (const invalid of [
      { ...validQuestionOptions, questionCount: 0 },
      { ...validQuestionOptions, questionCount: 101 },
      {
        ...validQuestionOptions,
        questionTypePlan: [{ questionTypeVersionId, count: 1 }],
      },
      {
        ...validQuestionOptions,
        difficultyPlan: [{ difficulty: 2, count: 1 }],
      },
      {
        ...validQuestionOptions,
        requiredVocabularyIds: [targetVocabularyId],
      },
      {
        ...validQuestionOptions,
        speakerVoiceAssignments: [
          { speakerRole: '진행자', voicePresetId },
          { speakerRole: ' 진행자 ', voicePresetId },
        ],
      },
      { ...validQuestionOptions, unexpected: true },
    ]) {
      expect(contentProductionQuestionOptionsSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

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

  it('prompt 미리보기와 preset 상태 전이 입력을 strict하게 검증한다', () => {
    expect(
      promptPreviewRequestSchema.parse({
        purpose: 'QUESTION_GENERATION',
        presetId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        options: validQuestionOptions,
        questionPlanIndex: 0,
      }),
    ).toMatchObject({ questionPlanIndex: 0 });
    expect(
      setContentProductionPresetEnabledRequestSchema.parse({
        enabled: false,
        expectedRevision: 0,
        requestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      }),
    ).toEqual({
      enabled: false,
      expectedRevision: 0,
      requestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
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
      inputs: privateResponse.inputs.map(
        ({ storageKey: _storageKey, ...input }) => input,
      ),
      items: privateResponse.items.map(
        ({ providerResponse: _providerResponse, ...item }) => item,
      ),
    });
    expect(JSON.stringify(parsed)).not.toContain('storageKey');
    expect(JSON.stringify(parsed)).not.toContain('providerResponse');
  });
});
