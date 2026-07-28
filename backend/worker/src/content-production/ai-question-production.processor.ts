/** 콘텐츠 제작 work item을 멱등한 AI 문제 후보 pipeline으로 처리한다 */
import { createHash } from 'node:crypto';
import {
  assertDistinctValidationModels,
  buildQuestionGenerationPrompt,
  classifyQuestionCandidate,
  hasTrustedQuestionCandidateReferences,
  normalizeQuestionProductionValidationRecord,
  normalizeQuestionProductionProviderResult,
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
  QuestionProductionProviderCandidate,
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

const redactedPayloadHash = createHash('sha256')
  .update(JSON.stringify({ payloadState: 'REDACTED_INVALID' }))
  .digest('hex');

const payloadHash = (
  candidate: QuestionProductionCandidateRecord['candidate'],
): string =>
  candidate.payloadState === 'REDACTED_INVALID'
    ? redactedPayloadHash
    : createHash('sha256')
        .update(JSON.stringify(canonicalJson(candidate.payload)))
        .digest('hex');

const redactedCandidate = (
  context: QuestionProductionContext,
): QuestionProductionProviderCandidate => ({
  candidate: {
    payloadState: 'REDACTED_INVALID',
    questionTypeVersionId: context.typeVersion.id,
    topicId: null,
    tagIds: [],
    difficulty: null,
    payload: null,
  },
  validationCode: 'QUESTION_SCHEMA_INVALID',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeFreshGeneratedCandidate = (
  value: unknown,
  context: QuestionProductionContext,
): QuestionProductionProviderCandidate => {
  if (validateGeneratedQuestionSchema(value).status === 'FAILED') {
    return redactedCandidate(context);
  }
  const candidate = value as GeneratedQuestionCandidate;
  if (!hasTrustedQuestionCandidateReferences(candidate, context)) {
    return {
      ...redactedCandidate(context),
      validationCode: 'QUESTION_RULE_INVALID',
    };
  }
  return {
    candidate: { payloadState: 'CANONICAL', ...candidate },
    validationCode: null,
  };
};

const normalizeFreshGeneratedCandidates = (
  value: unknown,
  context: QuestionProductionContext,
): QuestionProductionProviderCandidate[] => {
  if (!Array.isArray(value)) return [redactedCandidate(context)];
  return value.map((candidate) =>
    normalizeFreshGeneratedCandidate(candidate, context),
  );
};

const normalizeGeneratedCandidate = (
  value: unknown,
  context: QuestionProductionContext,
): QuestionProductionProviderCandidate => {
  const replayCandidate =
    isRecord(value) && 'candidate' in value ? value.candidate : value;
  const replayCode =
    isRecord(value) &&
    (value.validationCode === 'QUESTION_SCHEMA_INVALID' ||
      value.validationCode === 'QUESTION_RULE_INVALID')
      ? value.validationCode
      : null;
  if (
    isRecord(replayCandidate) &&
    replayCandidate.payloadState === 'REDACTED_INVALID' &&
    replayCandidate.questionTypeVersionId === context.typeVersion.id &&
    replayCandidate.topicId === null &&
    Array.isArray(replayCandidate.tagIds) &&
    replayCandidate.tagIds.length === 0 &&
    replayCandidate.difficulty === null &&
    replayCandidate.payload === null
  ) {
    return {
      ...redactedCandidate(context),
      validationCode: replayCode ?? 'QUESTION_SCHEMA_INVALID',
    };
  }
  const canonical =
    isRecord(replayCandidate) && replayCandidate.payloadState === 'CANONICAL'
      ? Object.fromEntries(
          Object.entries(replayCandidate).filter(
            ([key]) => key !== 'payloadState',
          ),
        )
      : replayCandidate;
  if (validateGeneratedQuestionSchema(canonical).status === 'FAILED') {
    return redactedCandidate(context);
  }
  const candidate = canonical as GeneratedQuestionCandidate;
  if (
    replayCode === 'QUESTION_RULE_INVALID' ||
    !hasTrustedQuestionCandidateReferences(candidate, context)
  ) {
    return {
      ...redactedCandidate(context),
      validationCode: 'QUESTION_RULE_INVALID',
    };
  }
  return {
    candidate: { payloadState: 'CANONICAL', ...candidate },
    validationCode: null,
  };
};

const normalizeGeneratedCandidates = (
  value: unknown,
  context: QuestionProductionContext,
): QuestionProductionProviderCandidate[] => {
  if (!Array.isArray(value)) return [redactedCandidate(context)];
  return value.map((candidate) =>
    normalizeGeneratedCandidate(candidate, context),
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
    return {
      status: 'SUCCEEDED',
      result: normalizeQuestionProductionProviderResult(claim.result),
    };
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
    result = normalizeQuestionProductionProviderResult(await call());
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
    const questionPlan = item.item.questionPlan;
    if (!questionPlan) {
      return this.persistEmpty(item, {
        status: 'FAILED',
        retryable: false,
        errorCode: 'QUESTION_PROVIDER_RESULT_INVALID',
      });
    }
    try {
      context = await this.contextRepository.load({
        preset: item.presetSnapshot,
        operation: 'QUESTION_GENERATION',
        questionPlan,
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
          candidates: normalizeFreshGeneratedCandidates(
            result.candidates,
            context,
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
        ? normalizeGeneratedCandidates(generation.result.candidates, context)
        : null;
    if (!generated) {
      return this.persistEmpty(item, {
        status: 'FAILED',
        retryable: false,
        errorCode: 'QUESTION_PROVIDER_RESULT_INVALID',
      });
    }
    if (generated.length !== 1) {
      return this.persistEmpty(item, {
        status: 'FAILED',
        retryable: false,
        errorCode: 'QUESTION_PROVIDER_RESULT_INVALID',
      });
    }

    const records: QuestionProductionCandidateRecord[] = [];
    const validations: QuestionProductionValidationRecord[] = [];
    const providerFailures: Array<{
      status: 'FAILED' | 'OUTCOME_UNKNOWN';
      errorCode: string;
      retryable: boolean;
    }> = [];

    for (const [ordinal, generatedCandidate] of generated.entries()) {
      if (signal.aborted) return abortedResult();

      const candidateValidations: QuestionProductionValidationRecord[] = [];
      const candidate = generatedCandidate.candidate;
      const canonicalCandidate =
        candidate.payloadState === 'CANONICAL'
          ? {
              questionTypeVersionId: candidate.questionTypeVersionId,
              topicId: candidate.topicId,
              tagIds: candidate.tagIds,
              difficulty: candidate.difficulty,
              payload: candidate.payload,
            }
          : null;
      const schema =
        canonicalCandidate === null
          ? generatedCandidate.validationCode === 'QUESTION_RULE_INVALID'
            ? ({ status: 'PASSED', code: null } as const)
            : ({
                status: 'FAILED',
                code: 'QUESTION_SCHEMA_INVALID',
              } as const)
          : validateGeneratedQuestionSchema(canonicalCandidate);
      candidateValidations.push(
        normalizeQuestionProductionValidationRecord({
          candidateOrdinal: ordinal,
          stage: 'SCHEMA',
          status: schema.status,
          code: schema.code,
          details: {},
        }),
      );
      const rules =
        candidate.payloadState === 'REDACTED_INVALID'
          ? generatedCandidate.validationCode === 'QUESTION_RULE_INVALID'
            ? ({
                status: 'FAILED',
                code: 'QUESTION_RULE_INVALID',
              } as const)
            : ({
                status: 'SKIPPED',
                code: 'QUESTION_VALIDATION_SKIPPED',
              } as const)
          : schema.status === 'PASSED'
            ? canonicalCandidate?.questionTypeVersionId ===
                questionPlan.questionTypeVersionId &&
              canonicalCandidate.difficulty === questionPlan.difficulty
              ? validateQuestionDecisionRules(canonicalCandidate, context)
              : ({
                  status: 'FAILED',
                  code: 'QUESTION_RULE_INVALID',
                } as const)
            : {
                status: 'SKIPPED' as const,
                code: 'QUESTION_VALIDATION_SKIPPED' as const,
              };
      candidateValidations.push(
        normalizeQuestionProductionValidationRecord({
          candidateOrdinal: ordinal,
          stage: 'DECISION_RULE',
          status: rules.status,
          code: rules.code,
          details: {},
        }),
      );

      if (
        canonicalCandidate !== null &&
        schema.status === 'PASSED' &&
        rules.status === 'PASSED'
      ) {
        try {
          const matches = (
            await this.similarityLookup.findSimilar(canonicalCandidate, 5)
          ).filter(({ score }) => score >= context.similarityThreshold);
          candidateValidations.push(
            normalizeQuestionProductionValidationRecord({
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
            }),
          );
        } catch {
          candidateValidations.push(
            normalizeQuestionProductionValidationRecord({
              candidateOrdinal: ordinal,
              stage: 'SIMILARITY',
              status: 'FAILED',
              code: 'QUESTION_SIMILARITY_LOOKUP_FAILED',
              details: {},
            }),
          );
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
              candidate: canonicalCandidate,
              promptVersion: prompt.promptVersion,
              signal,
            });
            return result.status === 'PASSED'
              ? {
                  kind: 'QUESTION_VALIDATION',
                  status: 'PASSED',
                  code: null,
                  evidence: result.evidence,
                  usage: result.usage,
                  estimatedCostUsd: result.estimatedCostUsd,
                  providerRequestId: result.providerRequestId,
                }
              : {
                  kind: 'QUESTION_VALIDATION',
                  status: 'FAILED',
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
          candidateValidations.push(
            normalizeQuestionProductionValidationRecord({
              candidateOrdinal: ordinal,
              stage: 'AI_CROSS_VALIDATION',
              status: 'FAILED',
              code: crossValidation.errorCode,
              details: { retryable: crossValidation.retryable },
            }),
          );
        } else if (crossValidation.result.kind !== 'QUESTION_VALIDATION') {
          providerFailures.push({
            status: 'FAILED',
            errorCode: 'QUESTION_PROVIDER_RESULT_INVALID',
            retryable: false,
          });
          candidateValidations.push(
            normalizeQuestionProductionValidationRecord({
              candidateOrdinal: ordinal,
              stage: 'AI_CROSS_VALIDATION',
              status: 'FAILED',
              code: 'QUESTION_PROVIDER_RESULT_INVALID',
              details: {},
            }),
          );
        } else {
          candidateValidations.push(
            normalizeQuestionProductionValidationRecord({
              candidateOrdinal: ordinal,
              stage: 'AI_CROSS_VALIDATION',
              status: crossValidation.result.status,
              code: crossValidation.result.code,
              details: { evidence: crossValidation.result.evidence },
            }),
          );
        }
      } else {
        candidateValidations.push(
          normalizeQuestionProductionValidationRecord({
            candidateOrdinal: ordinal,
            stage: 'SIMILARITY',
            status: 'SKIPPED',
            code: 'QUESTION_VALIDATION_SKIPPED',
            details: {},
          }),
        );
        candidateValidations.push(
          normalizeQuestionProductionValidationRecord({
            candidateOrdinal: ordinal,
            stage: 'AI_CROSS_VALIDATION',
            status: 'SKIPPED',
            code: 'QUESTION_VALIDATION_SKIPPED',
            details: {},
          }),
        );
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
