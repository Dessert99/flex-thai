/** AI 어휘 processor가 입력 형식과 후보 검증 pipeline을 지키는지 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  ContentOcrProvider,
  ContentProductionInputReader,
  ContentProductionWorkItem,
  ExtractedVocabularyCandidate,
  VocabularyCrossValidationProvider,
  VocabularyExtractionProvider,
  VocabularyProductionLookup,
  VocabularyProviderRunRepository,
} from '@flex-thia/domain';
import { VocabularyProviderCallError } from '@flex-thia/domain';
import { AiVocabularyProductionProcessor } from './ai-vocabulary-production.processor.js';

const workItem = (
  inputType: 'TEXT' | 'PDF' | 'IMAGE',
): ContentProductionWorkItem => ({
  jobId: 'job-id',
  jobAttempt: 0,
  requestedBy: 'admin-id',
  purpose: 'VOCABULARY_EXTRACTION',
  presetSnapshot: {
    id: 'preset-id',
    name: '어휘 추출',
    purpose: 'VOCABULARY_EXTRACTION',
    version: 1,
    parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
  },
  input: {
    jobInputId: 'job-input-id',
    ordinal: 0,
    uploadId: 'upload-id',
    inputType,
    inputKey: 'private/input',
    sizeBytes: 10,
  },
  item: {
    id: 'item-id',
    sourceRef: 'opaque',
    jobInputId: 'job-input-id',
    operation: 'VOCABULARY_EXTRACTION',
    status: 'PROCESSING',
    attempt: 0,
    retryable: false,
    errorCode: null,
    leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
    leaseToken: 'lease-token',
  },
});

const createProcessor = (
  candidates: ExtractedVocabularyCandidate[] = [
    {
      thai: 'สวัสดี',
      kind: 'WORD',
      meanings: [
        { meaningKo: '안녕하세요', partOfSpeech: '감탄사', difficulty: 1 },
      ],
    },
  ],
  lookupOverride?: VocabularyProductionLookup,
  validationOverride?: VocabularyCrossValidationProvider,
  providerRunsOverride?: VocabularyProviderRunRepository,
) => {
  let ocrCount = 0;
  const reader: ContentProductionInputReader = {
    read: () => Promise.resolve(new TextEncoder().encode('สวัสดี')),
  };
  const ocr: ContentOcrProvider = {
    recognize: () => {
      ocrCount += 1;
      return Promise.resolve({ text: 'สวัสดี' });
    },
  };
  const extraction: VocabularyExtractionProvider = {
    extract: () => Promise.resolve({ candidates }),
  };
  const validation: VocabularyCrossValidationProvider = validationOverride ?? {
    validate: () => Promise.resolve({ status: 'PASSED', code: null }),
  };
  const lookup: VocabularyProductionLookup = lookupOverride ?? {
    findExact: () => Promise.resolve(null),
    findSuspected: () => Promise.resolve([]),
  };
  let runSequence = 0;
  const providerRuns: VocabularyProviderRunRepository =
    providerRunsOverride ?? {
      claim: () =>
        Promise.resolve({ kind: 'CLAIMED', runId: `run-${runSequence++}` }),
      succeed: () => Promise.resolve(true),
      fail: () => Promise.resolve(true),
    };
  return {
    processor: new AiVocabularyProductionProcessor(
      reader,
      ocr,
      extraction,
      validation,
      lookup,
      providerRuns,
    ),
    getOcrCount: () => ocrCount,
  };
};

describe('AI 어휘 제작 processor', () => {
  it('TEXT 입력은 OCR 없이 후보와 세 검증을 저장한다', async () => {
    const { processor, getOcrCount } = createProcessor();

    const outcome = await processor.process(
      workItem('TEXT'),
      new AbortController().signal,
    );

    expect(getOcrCount()).toBe(0);
    expect(outcome).toMatchObject({
      status: 'SUCCEEDED',
      retryable: false,
      artifacts: {
        candidates: [
          {
            classification: 'NEW_VOCABULARY',
            resultGroup: 'NORMAL',
          },
        ],
        validations: [
          { stage: 'SCHEMA', status: 'PASSED' },
          { stage: 'DECISION_RULE', status: 'PASSED' },
          { stage: 'AI_CROSS_VALIDATION', status: 'PASSED' },
        ],
      },
    });
  });

  it.each(['PDF', 'IMAGE'] as const)(
    '%s 입력은 OCR을 정확히 한 번 호출한다',
    async (inputType) => {
      const { processor, getOcrCount } = createProcessor();

      await processor.process(
        workItem(inputType),
        new AbortController().signal,
      );

      expect(getOcrCount()).toBe(1);
    },
  );

  it('추출 후보가 없으면 성공으로 숨기지 않고 주의 상태를 반환한다', async () => {
    const { processor } = createProcessor([]);

    await expect(
      processor.process(workItem('TEXT'), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: false,
      errorCode: 'NO_VOCABULARY_CANDIDATES',
    });
  });

  it('exact 기존 뜻 후보도 독립 AI 검증 결과를 남긴다', async () => {
    const { processor } = createProcessor(undefined, {
      findExact: () =>
        Promise.resolve({
          vocabularyId: 'existing-id',
          meanings: [{ meaningKo: '안녕하세요' }],
        }),
      findSuspected: () => Promise.resolve([]),
    });

    const outcome = await processor.process(
      workItem('TEXT'),
      new AbortController().signal,
    );

    expect(outcome.artifacts?.validations).toContainEqual(
      expect.objectContaining({
        stage: 'AI_CROSS_VALIDATION',
        status: 'PASSED',
      }),
    );
    expect(outcome.status).toBe('NEEDS_ATTENTION');
  });

  it('후보 하나의 교차 검증 실패가 후속 후보와 기존 artifact를 버리지 않는다', async () => {
    let validationCount = 0;
    const { processor } = createProcessor(
      [
        {
          thai: 'หนึ่ง',
          kind: 'WORD',
          meanings: [
            { meaningKo: '하나', partOfSpeech: '수사', difficulty: 1 },
          ],
        },
        {
          thai: 'สอง',
          kind: 'WORD',
          meanings: [{ meaningKo: '둘', partOfSpeech: '수사', difficulty: 1 }],
        },
      ],
      undefined,
      {
        validate: () => {
          validationCount += 1;
          return validationCount === 1
            ? Promise.reject(
                new VocabularyProviderCallError(
                  'CROSS_VALIDATION_FAILED',
                  true,
                  true,
                ),
              )
            : Promise.resolve({ status: 'PASSED', code: null });
        },
      },
    );

    const outcome = await processor.process(
      workItem('TEXT'),
      new AbortController().signal,
    );

    expect(validationCount).toBe(2);
    expect(outcome).toMatchObject({
      status: 'FAILED',
      retryable: true,
      errorCode: 'CROSS_VALIDATION_FAILED',
      artifacts: {
        candidates: [
          { ordinal: 0, resultGroup: 'FAILED' },
          { ordinal: 1, resultGroup: 'NORMAL' },
        ],
      },
    });
    expect(outcome.artifacts?.validations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateOrdinal: 0,
          stage: 'AI_CROSS_VALIDATION',
          status: 'FAILED',
          code: 'CROSS_VALIDATION_FAILED',
        }),
        expect.objectContaining({
          candidateOrdinal: 1,
          stage: 'AI_CROSS_VALIDATION',
          status: 'PASSED',
        }),
      ]),
    );
  });
});
