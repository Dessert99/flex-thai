/** 실제 DB port를 사용해 비용 없는 콘텐츠 제작 후보를 생성한다 */
import { createHash } from 'node:crypto';
import {
  evaluateVocabularyCandidate,
  normalizeQuestionProductionValidationRecord,
  readVocabularyProductionPolicy,
  validateGeneratedQuestionSchema,
  validateQuestionDecisionRules,
} from '@flex-thia/domain';
import type {
  ContentProductionWorkItem,
  GeneratedQuestionCandidate,
  GeneratedQuestionSentenceInput,
  QuestionProductionArtifacts,
  QuestionProductionCandidateRepository,
  QuestionProductionContext,
  QuestionProductionContextRepository,
  VocabularyProductionArtifacts,
  VocabularyProductionLookup,
} from '@flex-thia/domain';

/** local fake processor가 artifact를 만들 때 필요한 domain repository port 묶음 */
export interface DeterministicContentProductionProcessorDependencies {
  vocabularyLookup: VocabularyProductionLookup;
  questionContext: QuestionProductionContextRepository;
  questionCandidates: QuestionProductionCandidateRepository;
}

/** local fake processor의 항목 처리 결과 */
export interface DeterministicContentProductionOutcome {
  status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
  retryable: boolean;
  errorCode: string | null;
  result?: Record<string, unknown>;
  artifacts?: VocabularyProductionArtifacts;
}

const readAllowedTopic = (
  context: QuestionProductionContext,
): { id: string; slug: string } | null => {
  const topics = context.typeVersion.generationRules['allowedTopics'];
  if (!Array.isArray(topics)) return null;

  const topic = topics.find(
    (value): value is { id: string; slug: string } =>
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { id?: unknown }).id === 'string' &&
      typeof (value as { slug?: unknown }).slug === 'string',
  );
  return topic ?? null;
};

const candidateSentence = (
  vocabulary: QuestionProductionContext['targetVocabulary'][number],
  references: {
    vocabularyId: string;
    meaningId: string;
    pronunciationId: string;
  },
): GeneratedQuestionSentenceInput => ({
  originalText: vocabulary.thai,
  translationKo: vocabulary.meaningKo,
  pronunciationKo: vocabulary.pronunciationKo ?? '로컬 발음',
  toneMarks: 'LOCAL',
  tokens: [
    {
      surface: vocabulary.thai,
      startOffset: 0,
      endOffset: Array.from(vocabulary.thai).length,
      vocabulary: { id: references.vocabularyId },
      meaning: { id: references.meaningId },
      pronunciation: { id: references.pronunciationId },
      contextMeaningKo: vocabulary.meaningKo,
      role: 'TARGET',
    },
  ],
  expressions: [],
});

const buildQuestionCandidate = (
  context: QuestionProductionContext,
): GeneratedQuestionCandidate | null => {
  const topic = readAllowedTopic(context);
  const vocabulary = context.targetVocabulary[0];
  const optionCount = context.typeVersion.structureRules['optionCount'];
  if (
    !topic ||
    !vocabulary ||
    !vocabulary.id ||
    !vocabulary.meaningId ||
    !vocabulary.pronunciationId ||
    context.typeVersion.template !== 'STANDARD_CHOICE' ||
    typeof optionCount !== 'number' ||
    !Number.isInteger(optionCount) ||
    optionCount < 1
  ) {
    return null;
  }

  const sentence = candidateSentence(vocabulary, {
    vocabularyId: vocabulary.id,
    meaningId: vocabulary.meaningId,
    pronunciationId: vocabulary.pronunciationId,
  });
  return {
    questionTypeVersionId: context.typeVersion.id,
    topicId: topic.id,
    tagIds: [],
    difficulty: context.difficulty,
    payload: {
      questionTypeSlug: context.typeVersion.slug,
      questionTypeVersion: context.typeVersion.version,
      difficulty: context.difficulty,
      topicSlug: topic.slug,
      tagSlugs: [],
      blocks: [
        {
          kind: 'QUESTION',
          displayMode: 'TEXT',
          sentences: [{ speaker: null, sentence }],
        },
      ],
      options: Array.from({ length: optionCount }, (_, position) => ({
        clientRef: `local-option-${position}`,
        position,
        sentence,
        span: null,
      })),
      correctOptionRef: 'local-option-0',
    },
  };
};

const failedQuestionArtifacts = (
  context: QuestionProductionContext,
): QuestionProductionArtifacts => ({
  kind: 'QUESTION_CANDIDATES',
  candidates: [
    {
      ordinal: 0,
      candidate: {
        payloadState: 'REDACTED_INVALID',
        questionTypeVersionId: context.typeVersion.id,
        topicId: null,
        tagIds: [],
        difficulty: null,
        payload: null,
      },
      payloadHash: createHash('sha256')
        .update('LOCAL_QUESTION_CANDIDATE_INVALID')
        .digest('hex'),
      resultGroup: 'FAILED',
      reviewStatus: 'PENDING',
      reviewCode: 'QUESTION_RULE_INVALID',
      regeneratedFromCandidateId: null,
      approvedQuestionId: null,
      approvedQuestionVersionId: null,
    },
  ],
  validations: [
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'SCHEMA',
      status: 'FAILED',
      code: 'QUESTION_SCHEMA_INVALID',
      details: {},
    }),
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'DECISION_RULE',
      status: 'SKIPPED',
      code: 'QUESTION_VALIDATION_SKIPPED',
      details: {},
    }),
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'SIMILARITY',
      status: 'SKIPPED',
      code: 'QUESTION_VALIDATION_SKIPPED',
      details: {},
    }),
    normalizeQuestionProductionValidationRecord({
      candidateOrdinal: 0,
      stage: 'AI_CROSS_VALIDATION',
      status: 'SKIPPED',
      code: 'QUESTION_VALIDATION_SKIPPED',
      details: {},
    }),
  ],
});

const questionArtifacts = (
  context: QuestionProductionContext,
): QuestionProductionArtifacts => {
  const candidate = buildQuestionCandidate(context);
  if (!candidate) return failedQuestionArtifacts(context);

  const schema = validateGeneratedQuestionSchema(candidate);
  const rules =
    schema.status === 'PASSED'
      ? validateQuestionDecisionRules(candidate, context)
      : { status: 'FAILED' as const, code: 'QUESTION_RULE_INVALID' as const };
  if (schema.status !== 'PASSED' || rules.status !== 'PASSED') {
    return failedQuestionArtifacts(context);
  }

  return {
    kind: 'QUESTION_CANDIDATES',
    candidates: [
      {
        ordinal: 0,
        candidate: { payloadState: 'CANONICAL', ...candidate },
        payloadHash: createHash('sha256')
          .update(JSON.stringify(candidate.payload))
          .digest('hex'),
        resultGroup: 'NORMAL',
        reviewStatus: 'PENDING',
        reviewCode: null,
        regeneratedFromCandidateId: null,
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
      },
    ],
    validations: [
      normalizeQuestionProductionValidationRecord({
        candidateOrdinal: 0,
        stage: 'SCHEMA',
        status: 'PASSED',
        code: null,
        details: {},
      }),
      normalizeQuestionProductionValidationRecord({
        candidateOrdinal: 0,
        stage: 'DECISION_RULE',
        status: 'PASSED',
        code: null,
        details: {},
      }),
      normalizeQuestionProductionValidationRecord({
        candidateOrdinal: 0,
        stage: 'SIMILARITY',
        status: 'PASSED',
        code: null,
        details: {},
      }),
      normalizeQuestionProductionValidationRecord({
        candidateOrdinal: 0,
        stage: 'AI_CROSS_VALIDATION',
        status: 'PASSED',
        code: null,
        details: {},
      }),
    ],
  };
};

/** sourceRef suffix로 비용 없는 성공·검토·실패 fixture를 생성한다 */
export class DeterministicContentProductionProcessor {
  readonly vocabularyLookup: VocabularyProductionLookup;
  readonly questionContext: QuestionProductionContextRepository;
  readonly questionCandidates: QuestionProductionCandidateRepository;

  constructor(
    dependencies: DeterministicContentProductionProcessorDependencies,
  ) {
    this.vocabularyLookup = dependencies.vocabularyLookup;
    this.questionContext = dependencies.questionContext;
    this.questionCandidates = dependencies.questionCandidates;
  }

  /** 같은 sourceRef에는 언제나 같은 항목 결과와 artifact를 반환한다 */
  async process(
    workItem: ContentProductionWorkItem,
    signal: AbortSignal,
  ): Promise<DeterministicContentProductionOutcome> {
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error('콘텐츠 제작 항목 처리가 취소되었습니다');
    }

    const { item } = workItem;
    if (
      item.sourceRef.endsWith(':fail') ||
      /^input:2(?::|$)/u.test(item.sourceRef)
    ) {
      return {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_FAKE_FAILURE',
      };
    }
    if (
      item.sourceRef.endsWith(':attention') ||
      /^input:1(?::|$)/u.test(item.sourceRef)
    ) {
      return {
        status: 'NEEDS_ATTENTION',
        retryable: false,
        errorCode: null,
        result: { reviewReason: 'LOCAL_FAKE_ATTENTION' },
      };
    }

    if (item.operation === 'VOCABULARY_EXTRACTION') {
      const evaluated = await evaluateVocabularyCandidate({
        candidate: {
          thai: 'ทดสอบระบบ',
          kind: 'EXPRESSION',
          meanings: [
            {
              meaningKo: '로컬 시스템 테스트',
              partOfSpeech: '표현',
              difficulty: 1,
            },
          ],
        },
        ordinal: 0,
        lookup: this.vocabularyLookup,
        policy: readVocabularyProductionPolicy(
          workItem.presetSnapshot.parameters,
        ),
      });
      const artifacts: VocabularyProductionArtifacts = {
        kind: 'VOCABULARY_CANDIDATES',
        candidates: [evaluated.candidate],
        validations: evaluated.validations,
      };
      return {
        status: 'SUCCEEDED',
        retryable: false,
        errorCode: null,
        result: { generatedCount: 1 },
        artifacts,
      };
    }

    if (!item.questionPlan) {
      return {
        status: 'FAILED',
        retryable: false,
        errorCode: 'LOCAL_QUESTION_PLAN_MISSING',
      };
    }

    let context: QuestionProductionContext;
    try {
      context = await this.questionContext.load({
        preset: workItem.presetSnapshot,
        operation: 'QUESTION_GENERATION',
        questionPlan: item.questionPlan,
      });
    } catch {
      return {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_QUESTION_CONTEXT_LOAD_FAILED',
      };
    }

    const artifacts = questionArtifacts(context);
    const normal = artifacts.candidates[0]?.resultGroup === 'NORMAL';
    const outcome: DeterministicContentProductionOutcome = {
      status: normal ? 'SUCCEEDED' : 'NEEDS_ATTENTION',
      retryable: false,
      errorCode: null,
      result: {
        total: 1,
        normal: normal ? 1 : 0,
        needsAttention: 0,
        failed: normal ? 0 : 1,
      },
    };

    try {
      const persisted = await this.questionCandidates.persist({
        jobId: workItem.jobId,
        itemId: item.id,
        attempt: workItem.jobAttempt,
        leaseToken: item.leaseToken,
        outcome,
        artifacts,
      });
      return persisted
        ? outcome
        : {
            status: 'NEEDS_ATTENTION',
            retryable: true,
            errorCode: 'LOCAL_QUESTION_STALE_LEASE',
          };
    } catch {
      return {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_QUESTION_ARTIFACT_PERSIST_FAILED',
      };
    }
  }
}
