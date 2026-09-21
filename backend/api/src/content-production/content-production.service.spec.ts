/** 콘텐츠 제작 HTTP application 계층의 upload·preset 검증을 고정한다 */
import type {
  ContentProductionPresetSnapshot,
  CreateContentProductionCommand,
  ResolveContentProductionPresetSnapshotInput,
} from '@flex-thia/domain/content-production/content-production.service';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionApplicationService } from './content-production.service.js';

const ownerId = '8f47b4d5-97d6-4596-af72-16456be51be8';
const uploadId = '77a1e8ff-7c85-4739-9004-647e12e34b65';
const presetId = '405986f9-e552-4ce1-82d6-70a1fc460f96';
const typeVersionId = 'cbb22737-6f3d-4112-bb0e-8e4f005c810b';
const validOptions = {
  questionTypePlan: [{ questionTypeVersionId: typeVersionId, count: 1 }],
  difficultyPlan: [{ difficulty: 2 as const, count: 1 }],
  targetVocabularyIds: [],
  requiredVocabularyIds: [],
  excludedVocabularyIds: [],
  newAuxiliaryVocabularyLimit: 0,
  similarityThreshold: 0.7,
  additionalInstructionKo: null,
};

const createService = (options?: {
  uploads?: unknown[];
  presetPurpose?: 'VOCABULARY_EXTRACTION';
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
  );
  return { service, create, presets };
};

describe('ContentProductionApplicationService 입력 조립', () => {
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
