/** 콘텐츠 제작 API의 UUID command와 query key 경계를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedRequest } from '@/shared/api';
import {
  contentProductionJobQueryOptions,
  contentProductionJobsQueryOptions,
  contentProductionPresetsQueryOptions,
  createContentProductionJob,
  previewContentProductionPrompt,
  retryContentProductionJob,
} from './contentProductionApi';

vi.mock('@/shared/api', () => ({ authenticatedRequest: vi.fn() }));

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

describe('콘텐츠 제작 API', () => {
  beforeEach(() => vi.mocked(authenticatedRequest).mockReset());

  it('최근 작업 limit을 query key와 요청 경로에 함께 고정한다', () => {
    const options = contentProductionJobsQueryOptions(7);
    expect(options.queryKey).toEqual([
      'admin',
      'content-production',
      'jobs',
      7,
    ]);
  });

  it('검증된 strict command만 작업 생성 요청으로 전달한다', () => {
    void createContentProductionJob({
      clientRequestId: id(1),
      purpose: 'VOCABULARY_EXTRACTION',
      presetId: id(2),
      uploadIds: [id(3)],
      options: {},
    });
    const request: unknown = vi.mocked(authenticatedRequest).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      method: 'POST',
      path: '/admin/content-production/jobs',
      body: { clientRequestId: id(1) },
    });
  });

  it('preset·상세 query가 signal과 UUID path를 보존한다', async () => {
    const signal = new AbortController().signal;
    const presets = contentProductionPresetsQueryOptions();
    const detail = contentProductionJobQueryOptions(id(4));
    if (!presets.queryFn || !detail.queryFn) {
      throw new Error('CONTENT_PRODUCTION_QUERY_FUNCTION_REQUIRED');
    }

    await presets.queryFn({ signal } as never);
    await detail.queryFn({ signal } as never);

    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: '/admin/content-production/presets',
        signal,
      }),
    );
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: `/admin/content-production/jobs/${id(4)}`,
        signal,
      }),
    );
  });

  it('prompt preview와 retry를 서로 다른 POST endpoint로 보낸다', () => {
    void previewContentProductionPrompt({
      purpose: 'QUESTION_GENERATION',
      presetId: id(5),
      questionPlanIndex: 0,
      options: {
        questionCount: 1,
        questionTypePlan: [{ questionTypeVersionId: id(6), count: 1 }],
        difficultyPlan: [{ difficulty: 2, count: 1 }],
        targetVocabularyIds: [],
        requiredVocabularyIds: [],
        excludedVocabularyIds: [],
        newAuxiliaryVocabularyLimit: 1,
        similarityThreshold: 0.7,
        defaultVoicePresetId: id(7),
        speakerVoiceAssignments: [],
        additionalInstructionKo: null,
      },
    });
    void retryContentProductionJob(id(8));

    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'POST',
        path: '/admin/content-production/prompt-previews',
      }),
    );
    expect(authenticatedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'POST',
        path: `/admin/content-production/jobs/${id(8)}/retry`,
      }),
    );
  });

  it('상세 query는 UUID가 아닌 job ID를 요청 전에 거절한다', () => {
    expect(() => {
      const options = contentProductionJobQueryOptions('not-a-uuid');
      void options.queryFn?.({ signal: new AbortController().signal } as never);
    }).toThrow();
    expect(authenticatedRequest).not.toHaveBeenCalled();
  });
});
