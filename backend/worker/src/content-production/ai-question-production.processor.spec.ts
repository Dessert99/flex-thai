/** AI 문제 processor가 생성·검증·lease 저장 pipeline과 공개 결과 경계를 지키는지 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  ContentProductionWorkItem,
  GeneratedQuestionCandidate,
  QuestionCrossValidationProvider,
  QuestionGenerationProvider,
  QuestionProductionCandidateRepository,
  QuestionProductionContext,
  QuestionProductionContextRepository,
  QuestionProductionProviderRunRepository,
  QuestionSimilarityLookup,
} from '@flex-thia/domain';
import { AiQuestionProductionProcessor } from './ai-question-production.processor.js';

const sentence = {
  originalText: 'ข้อใดถูกต้อง',
  translationKo: '어느 것이 맞습니까?',
  pronunciationKo: '커 다이 툭 떵',
  toneMarks: '',
  tokens: [
    {
      surface: 'ข้อใดถูกต้อง',
      startOffset: 0,
      endOffset: 12,
      vocabulary: { clientRef: 'vocabulary-question' },
      meaning: { clientRef: 'meaning-question' },
      pronunciation: { clientRef: 'pronunciation-question' },
      contextMeaningKo: '어느 것이 맞는가',
      role: 'TARGET' as const,
    },
  ],
  expressions: [],
};

const candidate = (ordinal = 0): GeneratedQuestionCandidate => ({
  questionTypeVersionId: 'type-version-id',
  topicId: 'topic-id',
  tagIds: [`tag-${ordinal}`],
  difficulty: 1,
  payload: {
    questionTypeSlug: 'reading-choice',
    questionTypeVersion: 1,
    difficulty: 1,
    topicSlug: 'daily-life',
    tagSlugs: [`tag-${ordinal}`],
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [{ speaker: null, sentence }],
      },
    ],
    options: [
      {
        clientRef: `option-${ordinal}`,
        position: 0,
        sentence,
        span: null,
      },
    ],
    correctOptionRef: `option-${ordinal}`,
  },
});

const context = (): QuestionProductionContext => ({
  commonPrinciples: ['FLEX 형식'],
  typeVersion: {
    id: 'type-version-id',
    slug: 'reading-choice',
    version: 1,
    template: 'STANDARD_CHOICE',
    structureRules: { optionCount: 1 },
    generationRules: {
      allowedTopics: [
        { id: 'topic-id', slug: 'daily-life', displayName: '일상' },
      ],
      allowedTags: Array.from({ length: 10 }, (_, index) => ({
        id: `tag-${index}`,
        slug: `tag-${index}`,
        displayName: `태그 ${index}`,
      })),
    },
  },
  difficultyCriteria: [1, 2, 3, 4, 5].map((difficulty) => ({
    difficulty,
    criteria: `${difficulty}단계`,
  })),
  approvedExamples: [
    {
      title: '승인 예시',
      payload: candidate().payload,
    },
  ],
  targetVocabulary: [
    {
      thai: 'ข้อใดถูกต้อง',
      meaningKo: '어느 것이 맞는가',
      partOfSpeech: '표현',
      difficulty: 1,
    },
  ],
  requiredVocabulary: [],
  excludedVocabulary: [],
  newAuxiliaryVocabularyLimit: 0,
  similarQuestions: [],
  additionalInstructionKo: null,
});

type QuestionWorkItem = ContentProductionWorkItem & {
  item: ContentProductionWorkItem['item'] & {
    operation: 'QUESTION_GENERATION';
  };
};

const workItem = (): QuestionWorkItem => ({
  jobId: 'job-id',
  jobAttempt: 1,
  requestedBy: 'admin-id',
  purpose: 'QUESTION_GENERATION',
  presetSnapshot: {
    id: 'preset-id',
    name: '문제 생성',
    purpose: 'QUESTION_GENERATION',
    version: 1,
    parameters: {},
  },
  input: {
    jobInputId: 'job-input-id',
    ordinal: 0,
    uploadId: 'upload-id',
    inputType: 'TEXT',
    inputKey: 'private/input-key',
    sizeBytes: 12,
  },
  item: {
    id: 'item-id',
    sourceRef: 'opaque-source',
    jobInputId: 'job-input-id',
    operation: 'QUESTION_GENERATION',
    status: 'PROCESSING',
    attempt: 1,
    retryable: false,
    errorCode: null,
    leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
    leaseToken: 'lease-token',
  },
});

const createProcessor = (overrides?: {
  context?: QuestionProductionContext;
  candidates?: GeneratedQuestionCandidate[];
  generation?: QuestionGenerationProvider;
  crossValidation?: QuestionCrossValidationProvider;
  similarity?: QuestionSimilarityLookup;
  providerRuns?: QuestionProductionProviderRunRepository;
  candidateRepository?: QuestionProductionCandidateRepository;
  generationModel?: string;
  crossValidationModel?: string;
}) => {
  let runSequence = 0;
  const contextRepository: QuestionProductionContextRepository = {
    load: () => Promise.resolve(overrides?.context ?? context()),
  };
  const generation: QuestionGenerationProvider = overrides?.generation ?? {
    generate: () =>
      Promise.resolve({
        candidates: overrides?.candidates ?? [candidate()],
        usage: {},
        estimatedCostUsd: '0',
        providerRequestId: null,
      }),
  };
  const crossValidation: QuestionCrossValidationProvider =
    overrides?.crossValidation ?? {
      validate: () =>
        Promise.resolve({
          status: 'PASSED',
          code: null,
          evidence: {},
          usage: {},
          estimatedCostUsd: '0',
          providerRequestId: null,
        }),
    };
  const similarity: QuestionSimilarityLookup = overrides?.similarity ?? {
    findSimilar: () => Promise.resolve([]),
  };
  const providerRuns: QuestionProductionProviderRunRepository =
    overrides?.providerRuns ?? {
      claim: () =>
        Promise.resolve({ kind: 'CLAIMED', runId: `run-${runSequence++}` }),
      succeed: () => Promise.resolve(true),
      fail: () => Promise.resolve(true),
    };
  const candidateRepository: QuestionProductionCandidateRepository =
    overrides?.candidateRepository ?? {
      persist: () => Promise.resolve(true),
    };

  return new AiQuestionProductionProcessor(
    contextRepository,
    generation,
    crossValidation,
    similarity,
    providerRuns,
    candidateRepository,
    {
      generationProvider: 'QUESTION_AI',
      generationModel: overrides?.generationModel ?? 'generation-model',
      crossValidationProvider: 'QUESTION_AI',
      crossValidationModel:
        overrides?.crossValidationModel ?? 'validation-model',
    },
  );
};

describe('AI 문제 제작 processor', () => {
  it('context부터 artifact 저장까지 정해진 순서로 후보를 처리한다', async () => {
    const calls: string[] = [];
    const baseContext = context();
    const processor = new AiQuestionProductionProcessor(
      {
        load: () => {
          calls.push('context');
          return Promise.resolve(baseContext);
        },
      },
      {
        generate: (input) => {
          calls.push('prompt');
          expect(input.prompt.sections.map(({ name }) => name)).toContain(
            'new-auxiliary-vocabulary-limit',
          );
          expect(input.prompt.sections).not.toContainEqual(
            expect.objectContaining({ content: 'private/input-key' }),
          );
          calls.push('generation');
          return Promise.resolve({
            candidates: [candidate()],
            usage: {},
            estimatedCostUsd: '0',
            providerRequestId: null,
          });
        },
      },
      {
        validate: () => {
          calls.push('cross-validation');
          return Promise.resolve({
            status: 'PASSED',
            code: null,
            evidence: {},
            usage: {},
            estimatedCostUsd: '0',
            providerRequestId: null,
          });
        },
      },
      {
        findSimilar: (_candidate, limit) => {
          calls.push('similarity');
          expect(limit).toBe(5);
          return Promise.resolve([]);
        },
      },
      {
        claim: ({ operation, sequence }) =>
          Promise.resolve({
            kind: 'CLAIMED',
            runId: `${operation}-${sequence}`,
          }),
        succeed: () => Promise.resolve(true),
        fail: () => Promise.resolve(true),
      },
      {
        persist: (input) => {
          calls.push('artifacts');
          expect(input.artifacts.validations.map(({ stage }) => stage)).toEqual(
            ['SCHEMA', 'DECISION_RULE', 'SIMILARITY', 'AI_CROSS_VALIDATION'],
          );
          expect(input.artifacts.candidates[0]).toMatchObject({
            ordinal: 0,
            resultGroup: 'NORMAL',
            reviewStatus: 'PENDING',
            approvedQuestionId: null,
            approvedQuestionVersionId: null,
          });
          return Promise.resolve(true);
        },
      },
      {
        generationProvider: 'QUESTION_AI',
        generationModel: 'generation-model',
        crossValidationProvider: 'QUESTION_AI',
        crossValidationModel: 'validation-model',
      },
    );

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toEqual({
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
      result: { total: 1, normal: 1, needsAttention: 0, failed: 0 },
    });
    expect(calls).toEqual([
      'context',
      'prompt',
      'generation',
      'similarity',
      'cross-validation',
      'artifacts',
    ]);
  });

  it('생성 문맥과 다른 유형 후보는 결정 규칙 실패로 격리한다', async () => {
    let persisted:
      | Parameters<QuestionProductionCandidateRepository['persist']>[0]
      | undefined;
    let similarityCalls = 0;
    let crossValidationCalls = 0;
    const mismatched = candidate();
    mismatched.questionTypeVersionId = 'other-type-version-id';
    const processor = createProcessor({
      candidates: [mismatched],
      similarity: {
        findSimilar: () => {
          similarityCalls += 1;
          return Promise.resolve([]);
        },
      },
      crossValidation: {
        validate: () => {
          crossValidationCalls += 1;
          return Promise.resolve({
            status: 'PASSED',
            code: null,
            evidence: {},
            usage: {},
            estimatedCostUsd: '0',
            providerRequestId: null,
          });
        },
      },
      candidateRepository: {
        persist: (input) => {
          persisted = input;
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      result: { total: 1, normal: 0, needsAttention: 0, failed: 1 },
    });
    expect(
      persisted?.artifacts.validations.find(
        ({ stage }) => stage === 'DECISION_RULE',
      ),
    ).toMatchObject({
      status: 'FAILED',
      code: 'QUESTION_RULE_INVALID',
    });
    expect(persisted?.artifacts.candidates[0]?.candidate).toEqual({
      payloadState: 'REDACTED_INVALID',
      questionTypeVersionId: 'type-version-id',
      topicId: null,
      tagIds: [],
      difficulty: null,
      payload: null,
    });
    expect(similarityCalls).toBe(0);
    expect(crossValidationCalls).toBe(0);
  });

  it('한 후보의 provider 실패를 격리하고 다음 후보를 계속 처리한다', async () => {
    let validationCalls = 0;
    let persistedGroups: string[] = [];
    let failedCrossValidationCode: string | null | undefined;
    const processor = createProcessor({
      candidates: [candidate(0), candidate(1)],
      crossValidation: {
        validate: () => {
          validationCalls += 1;
          if (validationCalls === 1) {
            return Promise.reject(new Error('provider failed'));
          }
          return Promise.resolve({
            status: 'PASSED',
            code: null,
            evidence: {},
            usage: {},
            estimatedCostUsd: '0',
            providerRequestId: null,
          });
        },
      },
      candidateRepository: {
        persist: (input) => {
          persistedGroups = input.artifacts.candidates.map(
            ({ resultGroup }) => resultGroup,
          );
          failedCrossValidationCode = input.artifacts.validations.find(
            ({ candidateOrdinal, stage }) =>
              candidateOrdinal === 0 && stage === 'AI_CROSS_VALIDATION',
          )?.code;
          return Promise.resolve(true);
        },
      },
    });

    const result = await processor.process(
      workItem(),
      new AbortController().signal,
    );

    expect(validationCalls).toBe(2);
    expect(persistedGroups).toEqual(['NEEDS_ATTENTION', 'NORMAL']);
    expect(failedCrossValidationCode).toBe('QUESTION_PROVIDER_CALL_FAILED');
    expect(result).toMatchObject({
      status: 'FAILED',
      retryable: true,
      errorCode: 'QUESTION_PROVIDER_CALL_FAILED',
      result: { total: 2, normal: 1, needsAttention: 1, failed: 0 },
    });
  });

  it('null code로 실패한 교차 검증 결과를 stable code로 저장한다', async () => {
    let crossValidationCode: string | null | undefined;
    const storedResults: unknown[] = [];
    const processor = createProcessor({
      crossValidation: {
        validate: () =>
          Promise.resolve({
            status: 'FAILED',
            code: null,
            evidence: { reason: 'independent-check' },
            usage: { inputTokens: 12 },
            estimatedCostUsd: '0.01',
            providerRequestId: 'cross-fresh-request',
          } as unknown as Awaited<
            ReturnType<QuestionCrossValidationProvider['validate']>
          >),
      },
      providerRuns: {
        claim: ({ operation, sequence }) =>
          Promise.resolve({
            kind: 'CLAIMED',
            runId: `${operation}-${sequence}`,
          }),
        succeed: (_runId, result) => {
          storedResults.push(result);
          return Promise.resolve(true);
        },
        fail: () => Promise.resolve(true),
      },
      candidateRepository: {
        persist: (input) => {
          crossValidationCode = input.artifacts.validations.find(
            ({ stage }) => stage === 'AI_CROSS_VALIDATION',
          )?.code;
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      errorCode: null,
    });
    expect(crossValidationCode).toBe('QUESTION_CROSS_VALIDATION_FAILED');
    expect(
      storedResults.find(
        (
          result,
        ): result is {
          kind: 'QUESTION_VALIDATION';
          status: 'FAILED';
          code: string;
          evidence: Record<string, unknown>;
          usage?: Record<string, number>;
          estimatedCostUsd?: string;
          providerRequestId?: string | null;
        } =>
          typeof result === 'object' &&
          result !== null &&
          'kind' in result &&
          result.kind === 'QUESTION_VALIDATION',
      ),
    ).toEqual({
      kind: 'QUESTION_VALIDATION',
      status: 'FAILED',
      code: 'QUESTION_CROSS_VALIDATION_FAILED',
      evidence: { reason: 'independent-check' },
      usage: { inputTokens: 12 },
      estimatedCostUsd: '0.01',
      providerRequestId: 'cross-fresh-request',
    });
  });

  it('replay된 null code 교차 검증 결과를 사용 전에 stable code로 정규화한다', async () => {
    let crossValidationCalls = 0;
    let replayedValidation: unknown;
    const processor = createProcessor({
      crossValidation: {
        validate: () => {
          crossValidationCalls += 1;
          return Promise.reject(new Error('replay에서는 호출되면 안 됨'));
        },
      },
      providerRuns: {
        claim: ({ operation }) =>
          Promise.resolve(
            operation === 'QUESTION_CROSS_VALIDATION'
              ? {
                  kind: 'REPLAY',
                  result: {
                    kind: 'QUESTION_VALIDATION',
                    status: 'FAILED',
                    code: null,
                    evidence: { reason: 'replayed-check' },
                    usage: { outputTokens: 4 },
                    estimatedCostUsd: '0.02',
                    providerRequestId: 'cross-replay-request',
                  } as unknown as Parameters<
                    QuestionProductionProviderRunRepository['succeed']
                  >[1],
                }
              : { kind: 'CLAIMED', runId: operation },
          ),
        succeed: () => Promise.resolve(true),
        fail: () => Promise.resolve(true),
      },
      candidateRepository: {
        persist: (input) => {
          replayedValidation = input.artifacts.validations.find(
            ({ stage }) => stage === 'AI_CROSS_VALIDATION',
          );
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({ status: 'NEEDS_ATTENTION' });
    expect(crossValidationCalls).toBe(0);
    expect(replayedValidation).toMatchObject({
      status: 'FAILED',
      code: 'QUESTION_CROSS_VALIDATION_FAILED',
      details: { evidence: { reason: 'replayed-check' } },
    });
  });

  it('유사도 lookup 실패를 stable code로 저장한다', async () => {
    let similarityCode: string | null | undefined;
    const processor = createProcessor({
      similarity: {
        findSimilar: () => Promise.reject(new Error('lookup failed')),
      },
      candidateRepository: {
        persist: (input) => {
          similarityCode = input.artifacts.validations.find(
            ({ stage }) => stage === 'SIMILARITY',
          )?.code;
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'QUESTION_SIMILARITY_LOOKUP_FAILED',
    });
    expect(similarityCode).toBe('QUESTION_SIMILARITY_LOOKUP_FAILED');
  });

  it('생성 후보가 없으면 성공으로 숨기지 않는다', async () => {
    const processor = createProcessor({ candidates: [] });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: false,
      errorCode: 'NO_QUESTION_CANDIDATES',
      result: { total: 0, normal: 0, needsAttention: 0, failed: 0 },
    });
  });

  it('저장된 생성 실행은 provider 재호출 없이 replay한다', async () => {
    let generationCalls = 0;
    const processor = createProcessor({
      generation: {
        generate: () => {
          generationCalls += 1;
          return Promise.reject(new Error('호출되면 안 됨'));
        },
      },
      providerRuns: {
        claim: ({ operation }) =>
          Promise.resolve(
            operation === 'QUESTION_GENERATION'
              ? {
                  kind: 'REPLAY',
                  result: {
                    kind: 'QUESTION_CANDIDATES',
                    candidates: [
                      {
                        candidate: {
                          payloadState: 'CANONICAL',
                          ...candidate(),
                        },
                        validationCode: null,
                      },
                    ],
                  },
                }
              : { kind: 'CLAIMED', runId: 'validation-run' },
          ),
        succeed: () => Promise.resolve(true),
        fail: () => Promise.resolve(true),
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(generationCalls).toBe(0);
  });

  it('provider 결과 불명 실행은 재호출하지 않고 주의 상태로 남긴다', async () => {
    let generationCalls = 0;
    const processor = createProcessor({
      generation: {
        generate: () => {
          generationCalls += 1;
          return Promise.reject(new Error('호출되면 안 됨'));
        },
      },
      providerRuns: {
        claim: () => Promise.resolve({ kind: 'OUTCOME_UNKNOWN' }),
        succeed: () => Promise.resolve(true),
        fail: () => Promise.resolve(true),
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: true,
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    });
    expect(generationCalls).toBe(0);
  });

  it('provider 성공 뒤 결과 기록 예외는 결과 불명으로 닫고 재시도 호출을 막는다', async () => {
    let generationCalls = 0;
    let runStatus: 'NEW' | 'OUTCOME_UNKNOWN' = 'NEW';
    const failures: Array<{ status: string; errorCode: string }> = [];
    const processor = createProcessor({
      generation: {
        generate: () => {
          generationCalls += 1;
          return Promise.resolve({
            candidates: [candidate()],
            usage: {},
            estimatedCostUsd: '0',
            providerRequestId: null,
          });
        },
      },
      providerRuns: {
        claim: ({ operation }) =>
          Promise.resolve(
            operation === 'QUESTION_GENERATION' &&
              runStatus === 'OUTCOME_UNKNOWN'
              ? { kind: 'OUTCOME_UNKNOWN' }
              : { kind: 'CLAIMED', runId: operation },
          ),
        succeed: (runId) =>
          runId === 'QUESTION_GENERATION'
            ? Promise.reject(new Error('result storage unavailable'))
            : Promise.resolve(true),
        fail: (_runId, failure) => {
          failures.push(failure);
          runStatus = 'OUTCOME_UNKNOWN';
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: true,
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    });
    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      retryable: true,
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    });

    expect(generationCalls).toBe(1);
    expect(failures).toContainEqual({
      status: 'OUTCOME_UNKNOWN',
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      retryable: true,
    });
  });

  it('malformed 후보를 redacted schema 실패로 격리하고 뒤의 정상 후보를 처리한다', async () => {
    let persisted:
      | Parameters<QuestionProductionCandidateRepository['persist']>[0]
      | undefined;
    const recordedProviderResults: unknown[] = [];
    const malformed = {
      providerPayload: 'private-provider-payload',
      payload: { raw: 'private-provider-payload' },
    };
    const processor = createProcessor({
      candidates: [
        null,
        malformed,
        candidate(2),
      ] as unknown as GeneratedQuestionCandidate[],
      providerRuns: {
        claim: ({ operation, sequence }) =>
          Promise.resolve({
            kind: 'CLAIMED',
            runId: `${operation}-${sequence}`,
          }),
        succeed: (_runId, result) => {
          recordedProviderResults.push(result);
          return Promise.resolve(true);
        },
        fail: () => Promise.resolve(true),
      },
      candidateRepository: {
        persist: (input) => {
          persisted = input;
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      result: { total: 3, normal: 1, needsAttention: 0, failed: 2 },
    });

    expect(
      persisted?.artifacts.validations.filter(
        ({ stage }) => stage === 'SCHEMA',
      ),
    ).toEqual([
      expect.objectContaining({
        candidateOrdinal: 0,
        status: 'FAILED',
        code: 'QUESTION_SCHEMA_INVALID',
      }),
      expect.objectContaining({
        candidateOrdinal: 1,
        status: 'FAILED',
        code: 'QUESTION_SCHEMA_INVALID',
      }),
      expect.objectContaining({
        candidateOrdinal: 2,
        status: 'PASSED',
      }),
    ]);
    expect(
      persisted?.artifacts.candidates.map(({ resultGroup }) => resultGroup),
    ).toEqual(['FAILED', 'FAILED', 'NORMAL']);
    expect(
      persisted?.artifacts.candidates
        .slice(0, 2)
        .map(({ candidate: stored, payloadHash }) => ({ stored, payloadHash })),
    ).toEqual([
      {
        stored: {
          payloadState: 'REDACTED_INVALID',
          questionTypeVersionId: 'type-version-id',
          topicId: null,
          tagIds: [],
          difficulty: null,
          payload: null,
        },
        payloadHash:
          '79732325ba08de315b7ed66b263eacf3222cb949fc1d2063d536cf7312775eb8',
      },
      {
        stored: {
          payloadState: 'REDACTED_INVALID',
          questionTypeVersionId: 'type-version-id',
          topicId: null,
          tagIds: [],
          difficulty: null,
          payload: null,
        },
        payloadHash:
          '79732325ba08de315b7ed66b263eacf3222cb949fc1d2063d536cf7312775eb8',
      },
    ]);
    expect(
      persisted?.artifacts.validations
        .filter(({ candidateOrdinal }) => candidateOrdinal === 0)
        .map(({ stage, status, code }) => ({ stage, status, code })),
    ).toEqual([
      { stage: 'SCHEMA', status: 'FAILED', code: 'QUESTION_SCHEMA_INVALID' },
      {
        stage: 'DECISION_RULE',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
      {
        stage: 'SIMILARITY',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
      {
        stage: 'AI_CROSS_VALIDATION',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
    ]);
    expect(JSON.stringify(persisted?.artifacts.candidates)).not.toContain(
      'private-provider-payload',
    );
    expect(JSON.stringify(recordedProviderResults)).not.toContain(
      'private-provider-payload',
    );
    expect(JSON.stringify(persisted)).not.toContain(
      '00000000-0000-0000-0000-000000000000',
    );
  });

  it('malformed replay도 provider 재호출 없이 격리하고 정상 후보를 처리한다', async () => {
    let generationCalls = 0;
    let persistedGroups: string[] = [];
    let persisted:
      | Parameters<QuestionProductionCandidateRepository['persist']>[0]
      | undefined;
    const processor = createProcessor({
      generation: {
        generate: () => {
          generationCalls += 1;
          return Promise.reject(new Error('호출되면 안 됨'));
        },
      },
      providerRuns: {
        claim: ({ operation }) =>
          Promise.resolve(
            operation === 'QUESTION_GENERATION'
              ? {
                  kind: 'REPLAY',
                  result: {
                    kind: 'QUESTION_CANDIDATES',
                    candidates: [{}, candidate(1)],
                  } as never,
                }
              : { kind: 'CLAIMED', runId: 'validation-run' },
          ),
        succeed: () => Promise.resolve(true),
        fail: () => Promise.resolve(true),
      },
      candidateRepository: {
        persist: (input) => {
          persisted = input;
          persistedGroups = input.artifacts.candidates.map(
            ({ resultGroup }) => resultGroup,
          );
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      result: { total: 2, normal: 1, needsAttention: 0, failed: 1 },
    });
    expect(generationCalls).toBe(0);
    expect(persistedGroups).toEqual(['FAILED', 'NORMAL']);
    expect(
      persisted?.artifacts.validations
        .filter(({ candidateOrdinal }) => candidateOrdinal === 0)
        .map(({ stage, status, code }) => ({ stage, status, code })),
    ).toEqual([
      { stage: 'SCHEMA', status: 'FAILED', code: 'QUESTION_SCHEMA_INVALID' },
      {
        stage: 'DECISION_RULE',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
      {
        stage: 'SIMILARITY',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
      {
        stage: 'AI_CROSS_VALIDATION',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
    ]);
  });

  it('결정 규칙 실패 뒤의 유사도·교차 검증을 SKIPPED로 저장한다', async () => {
    let persisted:
      | Parameters<QuestionProductionCandidateRepository['persist']>[0]
      | undefined;
    const processor = createProcessor({
      candidates: [
        {
          ...candidate(),
          payload: { ...candidate().payload, correctOptionRef: 'missing' },
        },
      ],
      candidateRepository: {
        persist: (input) => {
          persisted = input;
          return Promise.resolve(true);
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
      result: { total: 1, normal: 0, needsAttention: 0, failed: 1 },
    });
    expect(
      persisted?.artifacts.validations.map(({ stage, status, code }) => ({
        stage,
        status,
        code,
      })),
    ).toEqual([
      { stage: 'SCHEMA', status: 'PASSED', code: null },
      {
        stage: 'DECISION_RULE',
        status: 'FAILED',
        code: 'QUESTION_RULE_INVALID',
      },
      {
        stage: 'SIMILARITY',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
      {
        stage: 'AI_CROSS_VALIDATION',
        status: 'SKIPPED',
        code: 'QUESTION_VALIDATION_SKIPPED',
      },
    ]);
  });

  it('교차 검증 provider의 계약 밖 raw field를 실행 결과에 저장하지 않는다', async () => {
    const recordedProviderResults: unknown[] = [];
    const processor = createProcessor({
      crossValidation: {
        validate: () =>
          Promise.resolve({
            status: 'PASSED',
            code: null,
            evidence: {},
            usage: {},
            estimatedCostUsd: '0',
            providerRequestId: null,
            providerPayload: 'raw-cross-payload',
          } as Awaited<
            ReturnType<QuestionCrossValidationProvider['validate']>
          >),
      },
      providerRuns: {
        claim: ({ operation, sequence }) =>
          Promise.resolve({
            kind: 'CLAIMED',
            runId: `${operation}-${sequence}`,
          }),
        succeed: (_runId, result) => {
          recordedProviderResults.push(result);
          return Promise.resolve(true);
        },
        fail: () => Promise.resolve(true),
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(JSON.stringify(recordedProviderResults)).not.toContain(
      'raw-cross-payload',
    );
  });

  it('불완전 taxonomy는 generation provider 호출 없이 실패한다', async () => {
    let generationCalls = 0;
    const incomplete = context();
    incomplete.approvedExamples = [];
    const processor = createProcessor({
      context: incomplete,
      generation: {
        generate: () => {
          generationCalls += 1;
          return Promise.reject(new Error('호출되면 안 됨'));
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: false,
      errorCode: 'QUESTION_TAXONOMY_INCOMPLETE',
    });
    expect(generationCalls).toBe(0);
  });

  it('같은 model ID는 어떤 provider도 호출하기 전에 거절한다', async () => {
    let providerCalls = 0;
    const processor = createProcessor({
      generationModel: 'same-model',
      crossValidationModel: 'same-model',
      generation: {
        generate: () => {
          providerCalls += 1;
          return Promise.reject(new Error('호출되면 안 됨'));
        },
      },
      crossValidation: {
        validate: () => {
          providerCalls += 1;
          return Promise.reject(new Error('호출되면 안 됨'));
        },
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: false,
      errorCode: 'QUESTION_VALIDATION_MODEL_DUPLICATE',
    });
    expect(providerCalls).toBe(0);
  });

  it('이미 취소된 signal은 context와 provider와 artifact를 건드리지 않는다', async () => {
    let touched = 0;
    const processor = createProcessor({
      generation: {
        generate: () => {
          touched += 1;
          return Promise.reject(new Error('호출되면 안 됨'));
        },
      },
      candidateRepository: {
        persist: () => {
          touched += 1;
          return Promise.resolve(true);
        },
      },
    });
    const controller = new AbortController();
    controller.abort(new Error('lease lost'));

    await expect(
      processor.process(workItem(), controller.signal),
    ).resolves.toEqual({
      status: 'NEEDS_ATTENTION',
      retryable: true,
      errorCode: 'QUESTION_PRODUCTION_ABORTED',
    });
    expect(touched).toBe(0);
  });

  it('artifact 저장 시 lease가 stale이면 완료를 주장하지 않는다', async () => {
    const processor = createProcessor({
      candidateRepository: {
        persist: () => Promise.resolve(false),
      },
    });

    await expect(
      processor.process(workItem(), new AbortController().signal),
    ).resolves.toEqual({
      status: 'NEEDS_ATTENTION',
      retryable: true,
      errorCode: 'QUESTION_PRODUCTION_STALE_LEASE',
    });
  });
});
