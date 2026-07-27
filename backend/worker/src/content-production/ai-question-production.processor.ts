/** 콘텐츠 제작 work item을 멱등한 AI 문제 후보 pipeline으로 처리한다 */
import { createHash } from 'node:crypto';
import {
  assertDistinctValidationModels,
  buildQuestionGenerationPrompt,
  classifyQuestionCandidate,
  validateGeneratedQuestionSchema,
  validateQuestionDecisionRules,
} from '@flex-thia/domain';
import type {
  ContentProductionWorkItem,
  GeneratedQuestionCandidate,
  QuestionCrossValidationProvider,
  QuestionGenerationProvider,
  QuestionProductionArtifacts,
  QuestionProductionCandidateRecord,
  QuestionProductionCandidateRepository,
  QuestionProductionContext,
  QuestionProductionContextRepository,
  QuestionProductionProviderExecution,
  QuestionProductionProviderFailure,
  QuestionProductionProviderResult,
  QuestionProductionProviderRunRepository,
  QuestionProductionValidationRecord,
  QuestionSimilarityLookup,
} from '@flex-thia/domain';

type QuestionWorkItem = ContentProductionWorkItem & {
  item: ContentProductionWorkItem['item'] & {
    operation: 'QUESTION_GENERATION';
  };
};

type QuestionProductionCounts = {
  total: number;
  normal: number;
  needsAttention: number;
  failed: number;
};

/** processor의 provider/model runtime 식별자 */
export interface AiQuestionProductionProcessorConfig {
  generationProvider: string;
  generationModel: string;
  crossValidationProvider: string;
  crossValidationModel: string;
}

/** 공개 후보 payload 없이 item terminal 상태와 안정 집계만 전달한다 */
export interface AiQuestionProductionProcessResult {
  status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
  retryable: boolean;
  errorCode: string | null;
  result?: QuestionProductionCounts;
}

type ProviderOperationResult =
  | { status: 'SUCCEEDED'; result: QuestionProductionProviderResult }
  | {
      status: 'FAILED' | 'OUTCOME_UNKNOWN';
      errorCode: string;
      retryable: boolean;
    };

const emptyCounts = (): QuestionProductionCounts => ({
  total: 0,
  normal: 0,
  needsAttention: 0,
  failed: 0,
});

const canonicalJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalJson(item)]),
  );
};

const payloadHash = (candidate: GeneratedQuestionCandidate): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalJson(candidate.payload)))
    .digest('hex');

const firstAllowedTopicId = (
  context: QuestionProductionContext,
): string | null => {
  const rules: Record<string, unknown> = context.typeVersion.generationRules;
  const allowedTopics: unknown = rules['allowedTopics'];
  if (!Array.isArray(allowedTopics)) return null;
  const topics: unknown[] = allowedTopics;
  const topic = topics.find(
    (value): value is { id: string } =>
      value !== null &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string',
  );
  return topic?.id ?? null;
};

const invalidCandidateMarker = (
  context: QuestionProductionContext,
  item: QuestionWorkItem,
  ordinal: number,
  fallback: GeneratedQuestionCandidate | undefined,
): GeneratedQuestionCandidate => ({
  questionTypeVersionId: context.typeVersion.id,
  topicId:
    fallback?.topicId ??
    firstAllowedTopicId(context) ??
    '00000000-0000-0000-0000-000000000000',
  tagIds: [],
  difficulty: 1,
  payload: {
    questionTypeSlug: context.typeVersion.slug,
    questionTypeVersion: context.typeVersion.version,
    difficulty: 1,
    topicSlug: `invalid-${item.item.id}-${item.jobAttempt}-${ordinal}`,
    tagSlugs: [],
    blocks: [],
    options: [],
    correctOptionRef: '',
  },
});

const normalizeGeneratedCandidates = (
  value: unknown,
  context: QuestionProductionContext,
  item: QuestionWorkItem,
): GeneratedQuestionCandidate[] => {
  if (!Array.isArray(value)) {
    return [invalidCandidateMarker(context, item, 0, undefined)];
  }
  const fallback = value.find(
    (candidate) =>
      validateGeneratedQuestionSchema(candidate).status === 'PASSED',
  ) as GeneratedQuestionCandidate | undefined;
  return value.map((candidate, ordinal) =>
    validateGeneratedQuestionSchema(candidate).status === 'PASSED'
      ? (candidate as GeneratedQuestionCandidate)
      : invalidCandidateMarker(context, item, ordinal, fallback),
  );
};

const countsFor = (
  candidates: QuestionProductionCandidateRecord[],
): QuestionProductionCounts => ({
  total: candidates.length,
  normal: candidates.filter(({ resultGroup }) => resultGroup === 'NORMAL')
    .length,
  needsAttention: candidates.filter(
    ({ resultGroup }) => resultGroup === 'NEEDS_ATTENTION',
  ).length,
  failed: candidates.filter(({ resultGroup }) => resultGroup === 'FAILED')
    .length,
});

const executionFor = (
  item: QuestionWorkItem,
  input: Omit<
    QuestionProductionProviderExecution,
    'jobItemId' | 'jobAttempt' | 'itemLeaseToken'
  >,
): QuestionProductionProviderExecution => ({
  jobItemId: item.item.id,
  jobAttempt: item.jobAttempt,
  itemLeaseToken: item.item.leaseToken,
  ...input,
});

const runProviderOperation = async (
  execution: QuestionProductionProviderExecution,
  repository: QuestionProductionProviderRunRepository,
  call: () => Promise<QuestionProductionProviderResult>,
): Promise<ProviderOperationResult> => {
  const claim = await repository.claim(execution);
  if (claim.kind === 'REPLAY') {
    return { status: 'SUCCEEDED', result: claim.result };
  }
  if (claim.kind === 'OUTCOME_UNKNOWN') {
    return {
      status: 'OUTCOME_UNKNOWN',
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      retryable: true,
    };
  }

  let result: QuestionProductionProviderResult;
  try {
    result = await call();
  } catch {
    const failure: QuestionProductionProviderFailure = {
      status: 'FAILED',
      errorCode: 'QUESTION_PROVIDER_CALL_FAILED',
      retryable: true,
    };
    try {
      if (await repository.fail(claim.runId, failure)) return failure;
    } catch {
      // 실행 결과 기록도 불확실하면 같은 attempt에서 외부 호출을 반복하지 않는다.
    }
    return {
      status: 'OUTCOME_UNKNOWN',
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      retryable: true,
    };
  }

  try {
    if (await repository.succeed(claim.runId, result)) {
      return { status: 'SUCCEEDED', result };
    }
  } catch {
    // provider 성공 뒤 저장 실패는 호출 실패가 아니라 결과 불명이다.
  }

  const unknown: QuestionProductionProviderFailure = {
    status: 'OUTCOME_UNKNOWN',
    errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    retryable: true,
  };
  try {
    await repository.fail(claim.runId, unknown);
  } catch {
    // 저장소 장애가 이어져도 보수적으로 결과 불명을 반환한다.
  }
  return unknown;
};

const abortedResult = (): AiQuestionProductionProcessResult => ({
  status: 'NEEDS_ATTENTION',
  retryable: true,
  errorCode: 'QUESTION_PRODUCTION_ABORTED',
});

/** taxonomy부터 후보 artifact까지 순서를 고정하고 lease 아래 결과를 확정한다 */
export class AiQuestionProductionProcessor {
  constructor(
    private readonly contextRepository: QuestionProductionContextRepository,
    private readonly generationProvider: QuestionGenerationProvider,
    private readonly crossValidationProvider: QuestionCrossValidationProvider,
    private readonly similarityLookup: QuestionSimilarityLookup,
    private readonly providerRuns: QuestionProductionProviderRunRepository,
    private readonly candidateRepository: QuestionProductionCandidateRepository,
    private readonly config: AiQuestionProductionProcessorConfig,
  ) {}

  private async persist(
    item: QuestionWorkItem,
    result: AiQuestionProductionProcessResult,
    artifacts: QuestionProductionArtifacts,
  ): Promise<AiQuestionProductionProcessResult> {
    try {
      const saved = await this.candidateRepository.persist({
        jobId: item.jobId,
        itemId: item.item.id,
        attempt: item.jobAttempt,
        leaseToken: item.item.leaseToken,
        outcome: {
          status: result.status,
          retryable: result.retryable,
          errorCode: result.errorCode,
          ...(result.result ? { result: result.result } : {}),
        },
        artifacts,
      });
      return saved
        ? result
        : {
            status: 'NEEDS_ATTENTION',
            retryable: true,
            errorCode: 'QUESTION_PRODUCTION_STALE_LEASE',
          };
    } catch {
      return {
        status: 'FAILED',
        retryable: true,
        errorCode: 'QUESTION_ARTIFACT_PERSIST_FAILED',
      };
    }
  }

  private persistEmpty(
    item: QuestionWorkItem,
    result: AiQuestionProductionProcessResult,
  ): Promise<AiQuestionProductionProcessResult> {
    return this.persist(item, result, {
      kind: 'QUESTION_CANDIDATES',
      candidates: [],
      validations: [],
    });
  }

  /** 한 item의 후보 실패를 격리하고 공개 가능한 그룹 집계만 반환한다 */
  async process(
    item: QuestionWorkItem,
    signal: AbortSignal,
  ): Promise<AiQuestionProductionProcessResult> {
    if (signal.aborted) return abortedResult();

    try {
      assertDistinctValidationModels(
        this.config.generationModel,
        this.config.crossValidationModel,
      );
    } catch {
      return this.persistEmpty(item, {
        status: 'FAILED',
        retryable: false,
        errorCode: 'QUESTION_VALIDATION_MODEL_DUPLICATE',
      });
    }

    let context: QuestionProductionContext;
    let prompt;
    try {
      context = await this.contextRepository.load({
        preset: item.presetSnapshot,
        operation: 'QUESTION_GENERATION',
      });
      if (signal.aborted) return abortedResult();
      prompt = buildQuestionGenerationPrompt(context);
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          'QUESTION_TAXONOMY_INCOMPLETE',
          'QUESTION_AUXILIARY_VOCABULARY_LIMIT_INVALID',
        ].includes(error.message)
          ? error.message
          : 'QUESTION_CONTEXT_LOAD_FAILED';
      return this.persistEmpty(item, {
        status: 'FAILED',
        retryable: code === 'QUESTION_CONTEXT_LOAD_FAILED',
        errorCode: code,
      });
    }

    const generation = await runProviderOperation(
      executionFor(item, {
        operation: 'QUESTION_GENERATION',
        sequence: 0,
        provider: this.config.generationProvider,
        model: this.config.generationModel,
        promptVersion: prompt.promptVersion,
      }),
      this.providerRuns,
      async () => {
        const result = await this.generationProvider.generate({
          prompt,
          preset: item.presetSnapshot,
          signal,
        });
        return {
          kind: 'QUESTION_CANDIDATES',
          candidates: normalizeGeneratedCandidates(
            result.candidates,
            context,
            item,
          ),
          usage: result.usage,
          estimatedCostUsd: result.estimatedCostUsd,
          providerRequestId: result.providerRequestId,
        };
      },
    );
    if (signal.aborted) return abortedResult();
    if (generation.status !== 'SUCCEEDED') {
      return this.persistEmpty(item, {
        status:
          generation.status === 'OUTCOME_UNKNOWN'
            ? 'NEEDS_ATTENTION'
            : 'FAILED',
        retryable: generation.retryable,
        errorCode: generation.errorCode,
      });
    }

    const generated =
      generation.result.kind === 'QUESTION_CANDIDATES'
        ? normalizeGeneratedCandidates(
            generation.result.candidates,
            context,
            item,
          )
        : null;
    if (!generated) {
      return this.persistEmpty(item, {
        status: 'FAILED',
        retryable: false,
        errorCode: 'QUESTION_PROVIDER_RESULT_INVALID',
      });
    }
    if (generated.length === 0) {
      return this.persistEmpty(item, {
        status: 'NEEDS_ATTENTION',
        retryable: false,
        errorCode: 'NO_QUESTION_CANDIDATES',
        result: emptyCounts(),
      });
    }

    const records: QuestionProductionCandidateRecord[] = [];
    const validations: QuestionProductionValidationRecord[] = [];
    const providerFailures: Array<{
      status: 'FAILED' | 'OUTCOME_UNKNOWN';
      errorCode: string;
      retryable: boolean;
    }> = [];

    for (const [ordinal, candidate] of generated.entries()) {
      if (signal.aborted) return abortedResult();

      const candidateValidations: QuestionProductionValidationRecord[] = [];
      const schema = validateGeneratedQuestionSchema(candidate);
      candidateValidations.push({
        candidateOrdinal: ordinal,
        stage: 'SCHEMA',
        status: schema.status,
        code: schema.code,
        details: {},
      });
      const rules =
        schema.status === 'PASSED'
          ? validateQuestionDecisionRules(candidate)
          : {
              status: 'FAILED' as const,
              code: 'QUESTION_RULE_INVALID' as const,
            };
      candidateValidations.push({
        candidateOrdinal: ordinal,
        stage: 'DECISION_RULE',
        status: rules.status,
        code: rules.code,
        details: {},
      });

      if (schema.status === 'PASSED' && rules.status === 'PASSED') {
        try {
          const matches = await this.similarityLookup.findSimilar(candidate, 5);
          candidateValidations.push({
            candidateOrdinal: ordinal,
            stage: 'SIMILARITY',
            status: matches.length === 0 ? 'PASSED' : 'FAILED',
            code: matches.length === 0 ? null : 'QUESTION_SIMILARITY_REVIEW',
            details: {
              matches: matches.map(({ questionVersionId, score }) => ({
                questionVersionId,
                score,
              })),
            },
          });
        } catch {
          candidateValidations.push({
            candidateOrdinal: ordinal,
            stage: 'SIMILARITY',
            status: 'FAILED',
            code: 'QUESTION_SIMILARITY_LOOKUP_FAILED',
            details: {},
          });
          providerFailures.push({
            status: 'FAILED',
            errorCode: 'QUESTION_SIMILARITY_LOOKUP_FAILED',
            retryable: true,
          });
        }

        if (signal.aborted) return abortedResult();
        const crossValidation = await runProviderOperation(
          executionFor(item, {
            operation: 'QUESTION_CROSS_VALIDATION',
            sequence: ordinal,
            provider: this.config.crossValidationProvider,
            model: this.config.crossValidationModel,
            promptVersion: prompt.promptVersion,
          }),
          this.providerRuns,
          async () => {
            const result = await this.crossValidationProvider.validate({
              candidate,
              promptVersion: prompt.promptVersion,
              signal,
            });
            return {
              kind: 'QUESTION_VALIDATION',
              status: result.status,
              code: result.code,
              evidence: result.evidence,
              usage: result.usage,
              estimatedCostUsd: result.estimatedCostUsd,
              providerRequestId: result.providerRequestId,
            };
          },
        );
        if (signal.aborted) return abortedResult();

        if (crossValidation.status !== 'SUCCEEDED') {
          providerFailures.push(crossValidation);
          candidateValidations.push({
            candidateOrdinal: ordinal,
            stage: 'AI_CROSS_VALIDATION',
            status: 'FAILED',
            code: crossValidation.errorCode,
            details: { retryable: crossValidation.retryable },
          });
        } else if (crossValidation.result.kind !== 'QUESTION_VALIDATION') {
          providerFailures.push({
            status: 'FAILED',
            errorCode: 'QUESTION_PROVIDER_RESULT_INVALID',
            retryable: false,
          });
          candidateValidations.push({
            candidateOrdinal: ordinal,
            stage: 'AI_CROSS_VALIDATION',
            status: 'FAILED',
            code: 'QUESTION_PROVIDER_RESULT_INVALID',
            details: {},
          });
        } else {
          candidateValidations.push({
            candidateOrdinal: ordinal,
            stage: 'AI_CROSS_VALIDATION',
            status: crossValidation.result.status,
            code: crossValidation.result.code,
            details: { evidence: crossValidation.result.evidence },
          });
        }
      }

      const classification = classifyQuestionCandidate(candidateValidations);
      records.push({
        ordinal,
        candidate,
        payloadHash: payloadHash(candidate),
        resultGroup: classification.group,
        reviewStatus: 'PENDING',
        reviewCode: classification.code,
        regeneratedFromCandidateId: null,
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
      });
      validations.push(...candidateValidations);
    }

    const counts = countsFor(records);
    const outcomeUnknown = providerFailures.find(
      ({ status }) => status === 'OUTCOME_UNKNOWN',
    );
    const providerFailure = providerFailures[0];
    const result: AiQuestionProductionProcessResult = {
      status: outcomeUnknown
        ? 'NEEDS_ATTENTION'
        : providerFailure
          ? 'FAILED'
          : counts.needsAttention > 0 || counts.failed > 0
            ? 'NEEDS_ATTENTION'
            : 'SUCCEEDED',
      retryable: providerFailures.some(({ retryable }) => retryable),
      errorCode:
        outcomeUnknown?.errorCode ?? providerFailure?.errorCode ?? null,
      result: counts,
    };

    return this.persist(item, result, {
      kind: 'QUESTION_CANDIDATES',
      candidates: records,
      validations,
    });
  }
}
