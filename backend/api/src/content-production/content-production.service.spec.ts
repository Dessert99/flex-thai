/** 콘텐츠 제작 HTTP application 계층의 upload·preset 검증을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import type {
  ContentProductionPresetSnapshot,
  CreateContentProductionCommand,
  ResolveContentProductionPresetSnapshotInput,
} from '@flex-thia/domain';
import {
  ContentProductionApplicationError,
  ContentProductionApplicationService,
} from './content-production.service.js';

const ownerId = '8f47b4d5-97d6-4596-af72-16456be51be8';
const uploadId = '77a1e8ff-7c85-4739-9004-647e12e34b65';
const presetId = '405986f9-e552-4ce1-82d6-70a1fc460f96';
const typeVersionId = 'cbb22737-6f3d-4112-bb0e-8e4f005c810b';
const voicePresetId = 'a9979e5d-515d-43ab-a380-e88b78513c38';
const validOptions = {
  questionCount: 1,
  questionTypePlan: [{ questionTypeVersionId: typeVersionId, count: 1 }],
  difficultyPlan: [{ difficulty: 2 as const, count: 1 }],
  targetVocabularyIds: [],
  requiredVocabularyIds: [],
  excludedVocabularyIds: [],
  newAuxiliaryVocabularyLimit: 0,
  similarityThreshold: 0.7,
  defaultVoicePresetId: voicePresetId,
  speakerVoiceAssignments: [],
  additionalInstructionKo: null,
};

const createService = (options?: {
  uploads?: unknown[];
  presetPurpose?: 'VOCABULARY_EXTRACTION' | 'QUESTION_GENERATION';
}) => {
  const create = vi
    .fn<(command: CreateContentProductionCommand) => Promise<{ id: string }>>()
    .mockResolvedValue({ id: 'job-id' });
  const resolveEffectiveSnapshot = vi
    .fn<
      (
        input: ResolveContentProductionPresetSnapshotInput,
      ) => Promise<ContentProductionPresetSnapshot>
    >()
    .mockImplementation((input) =>
      Promise.resolve({
        id: presetId,
        name: '기본 생성',
        purpose: options?.presetPurpose ?? input.purpose,
        version: 1,
        parameters: {
          ...input.options,
          commonPrinciples: [],
          similarQuestions: [],
        },
      }),
    );
  const presets = {
    findEnabledById: vi.fn(),
    listEnabled: vi.fn().mockResolvedValue([]),
    listVersions: vi.fn().mockResolvedValue([]),
    resolveEffectiveSnapshot,
    createInitial: vi.fn(),
    createNextVersion: vi.fn(),
    setEnabled: vi.fn(),
  };
  const service = new ContentProductionApplicationService(
    {
      findVerifiedOwnedByIds: vi.fn().mockResolvedValue(
        options?.uploads ?? [
          {
            uploadId,
            inputType: 'PDF',
            inputKey: 'inputs/private.pdf',
            sizeBytes: 1024,
          },
        ],
      ),
    },
    presets,
    {
      create,
      getOwned: vi.fn(),
      listOwned: vi.fn(),
      retry: vi.fn(),
    } as never,
    undefined,
    {
      load: vi.fn().mockResolvedValue({
        commonPrinciples: [],
        difficulty: 2,
        similarityThreshold: 0.7,
        speakerRoles: [],
        typeVersion: {
          id: typeVersionId,
          slug: 'reading-choice',
          version: 1,
          template: 'STANDARD_CHOICE',
          structureRules: { optionCount: 1 },
          generationRules: { allowedTopics: [], allowedTags: [] },
        },
        difficultyCriteria: [1, 2, 3, 4, 5].map((difficulty) => ({
          difficulty,
          criteria: `${difficulty}단계`,
        })),
        approvedExamples: [
          {
            title: '승인 예시',
            payload: {
              questionTypeSlug: 'reading-choice',
              questionTypeVersion: 1,
              difficulty: 2,
              topicSlug: 'daily-life',
              tagSlugs: [],
              blocks: [],
              options: [],
              correctOptionRef: 'option-1',
            },
          },
        ],
        targetVocabulary: [],
        requiredVocabulary: [],
        excludedVocabulary: [],
        newAuxiliaryVocabularyLimit: 0,
        similarQuestions: [],
        additionalInstructionKo: null,
      }),
    },
  );
  return { service, create, presets };
};

describe('ContentProductionApplicationService 입력 조립', () => {
  it('소유하고 검증된 upload와 같은 목적 preset snapshot만 도메인에 전달한다', async () => {
    const { service, create } = createService();

    await service.create(ownerId, {
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'QUESTION_GENERATION',
      presetId,
      uploadIds: [uploadId],
      options: validOptions,
    });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      requestedBy: ownerId,
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'QUESTION_GENERATION',
      presetSnapshot: { id: presetId, version: 1 },
      inputs: [
        {
          uploadId,
          inputType: 'PDF',
          sizeBytes: 1024,
        },
      ],
    });
  });

  it('누락 upload과 다른 목적 preset을 stable application 오류로 거절한다', async () => {
    const missing = createService({ uploads: [] }).service;
    await expect(
      missing.create(ownerId, {
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'QUESTION_GENERATION',
        presetId,
        uploadIds: [uploadId],
        options: validOptions,
      }),
    ).rejects.toEqual(
      new ContentProductionApplicationError('UPLOAD_NOT_VERIFIED'),
    );

    const mismatch = createService({
      presetPurpose: 'VOCABULARY_EXTRACTION',
    }).service;
    await expect(
      mismatch.create(ownerId, {
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'QUESTION_GENERATION',
        presetId,
        uploadIds: [uploadId],
        options: validOptions,
      }),
    ).rejects.toEqual(
      new ContentProductionApplicationError('PRESET_NOT_AVAILABLE'),
    );
  });

  it('preview와 create가 같은 effective snapshot 입력을 사용한다', async () => {
    const { service, presets } = createService();

    await service.preview({
      purpose: 'QUESTION_GENERATION',
      presetId,
      options: validOptions,
      questionPlanIndex: 0,
    });
    await service.create(ownerId, {
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'QUESTION_GENERATION',
      presetId,
      uploadIds: [uploadId],
      options: validOptions,
    });

    expect(presets.resolveEffectiveSnapshot).toHaveBeenNthCalledWith(1, {
      purpose: 'QUESTION_GENERATION',
      presetId,
      options: validOptions,
    });
    expect(presets.resolveEffectiveSnapshot).toHaveBeenNthCalledWith(2, {
      purpose: 'QUESTION_GENERATION',
      presetId,
      options: validOptions,
    });
  });

  it('preview plan index가 범위를 벗어나면 stable 오류로 거절한다', async () => {
    const { service } = createService();

    await expect(
      service.preview({
        purpose: 'QUESTION_GENERATION',
        presetId,
        options: validOptions,
        questionPlanIndex: 1,
      }),
    ).rejects.toEqual(
      new ContentProductionApplicationError('QUESTION_PLAN_INDEX_INVALID'),
    );
  });

  it('service 직접 호출도 purpose와 preset parameters 불일치를 거절한다', () => {
    const { service, presets } = createService();

    expect(() =>
      service.createPreset({ userId: ownerId, sub: 'admin-sub' }, {
        requestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        name: '잘못된 preset',
        purpose: 'VOCABULARY_EXTRACTION',
        parameters: {
          ...validOptions,
          commonPrinciples: [],
          similarQuestions: [],
        },
      } as never),
    ).toThrow();
    expect(presets.createInitial).not.toHaveBeenCalled();
  });
});
