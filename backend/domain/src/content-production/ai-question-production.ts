/** AI 문제 제작 후보의 순수 모델·검증 규칙과 외부 port를 정의한다 */
import type { CanonicalDraftSentenceInput } from '../content-import/content-import.js';
import type { QuestionTemplate } from '../questions/question-version.js';
import { normalizeThaiSearchText } from '../vocabulary/normalize-thai-search-text.js';
import type { ContentProductionPresetSnapshot } from './content-production.service.js';

/** 후보 검토 우선순위를 나타내는 내부 그룹 */
export type QuestionCandidateGroup = 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';

/** 후보의 관리자 검토 lifecycle 상태 */
export type QuestionCandidateReviewStatus =
  'PENDING' | 'APPROVED' | 'DISCARDED';

/** 후보 검증을 기록하는 단계 */
export type QuestionValidationStage =
  'SCHEMA' | 'DECISION_RULE' | 'SIMILARITY' | 'AI_CROSS_VALIDATION';

/** 생성 모델이 media 없이 제안하는 문장 graph */
export type GeneratedQuestionSentenceInput = Omit<
  CanonicalDraftSentenceInput,
  'mediaAssetId'
>;

/** 생성 모델이 제안하는 일반 문장 또는 inline span 선택지 */
export type GeneratedQuestionOptionInput =
  | {
      clientRef: string;
      position: number;
      sentence: GeneratedQuestionSentenceInput;
      span: null;
    }
  | {
      clientRef: string;
      position: number;
      sentence: null;
      span: {
        blockPosition: number;
        sentencePosition: number;
        startTokenIndex: number;
        endTokenIndex: number;
      };
    };

/** 생성 모델이 반환하는 canonical 문제 payload */
export interface GeneratedQuestionPayload {
  questionTypeSlug: string;
  questionTypeVersion: number;
  difficulty: number;
  topicSlug: string;
  tagSlugs: string[];
  blocks: Array<{
    kind: 'INSTRUCTION' | 'PASSAGE' | 'DIALOGUE' | 'QUESTION' | 'EXPLANATION';
    displayMode: 'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO' | 'AUDIO_THEN_REVEAL';
    sentences: Array<{
      speaker: string | null;
      sentence: GeneratedQuestionSentenceInput;
    }>;
  }>;
  options: GeneratedQuestionOptionInput[];
  correctOptionRef: string;
}

/** 생성·검증 대상이 되는 구조화된 문제 후보 */
export interface GeneratedQuestionCandidate {
  questionTypeVersionId: string;
  topicId: string;
  tagIds: string[];
  difficulty: number;
  payload: GeneratedQuestionPayload;
}

/** 저장되는 후보별 검증 결과 — FAILED에는 반드시 stable code를 기록한다 */
export type QuestionProductionValidationRecord =
  | {
      candidateOrdinal: number;
      stage: QuestionValidationStage;
      status: 'PASSED';
      code: null;
      details: Record<string, unknown>;
    }
  | {
      candidateOrdinal: number;
      stage: QuestionValidationStage;
      status: 'FAILED';
      code: string;
      details: Record<string, unknown>;
    }
  | {
      candidateOrdinal: number;
      stage: QuestionValidationStage;
      status: 'SKIPPED';
      code: 'QUESTION_VALIDATION_SKIPPED';
      details: Record<string, unknown>;
    };

type UnnormalizedQuestionProductionValidationRecord = {
  candidateOrdinal: number;
  stage: QuestionValidationStage;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  code: string | null;
  details: Record<string, unknown>;
};

/** item attempt에 고정해 저장할 문제 후보 snapshot */
export interface QuestionProductionCandidateRecord {
  ordinal: number;
  candidate: GeneratedQuestionCandidate;
  payloadHash: string;
  resultGroup: QuestionCandidateGroup;
  reviewStatus: QuestionCandidateReviewStatus;
  reviewCode: string | null;
  regeneratedFromCandidateId: string | null;
  approvedQuestionId: string | null;
  approvedQuestionVersionId: string | null;
}

/** 문제 생성 item의 terminal 전이와 함께 보존할 후보 artifact */
export interface QuestionProductionArtifacts {
  kind: 'QUESTION_CANDIDATES';
  candidates: QuestionProductionCandidateRecord[];
  validations: QuestionProductionValidationRecord[];
}

/** 후보 규칙이 반환하는 단일 검증 결과 */
export type QuestionValidationResult =
  | { status: 'PASSED'; code: null }
  | {
      status: 'FAILED';
      code: 'QUESTION_SCHEMA_INVALID' | 'QUESTION_RULE_INVALID';
    };

/** 후보의 검토 그룹과 표시할 대표 code */
export interface QuestionCandidateClassification {
  group: QuestionCandidateGroup;
  code:
    | 'QUESTION_SCHEMA_INVALID'
    | 'QUESTION_RULE_INVALID'
    | 'QUESTION_SIMILARITY_REVIEW'
    | 'QUESTION_CROSS_VALIDATION_FAILED'
    | null;
}

const validationFailureCode = (stage: QuestionValidationStage): string => {
  switch (stage) {
    case 'SCHEMA':
      return 'QUESTION_SCHEMA_INVALID';
    case 'DECISION_RULE':
      return 'QUESTION_RULE_INVALID';
    case 'SIMILARITY':
      return 'QUESTION_SIMILARITY_REVIEW';
    case 'AI_CROSS_VALIDATION':
      return 'QUESTION_CROSS_VALIDATION_FAILED';
  }
};

/** 실패 code 누락을 stage별 stable code로 보정해 공개 계약 불변식을 지킨다 */
export const normalizeQuestionProductionValidationRecord = (
  input: UnnormalizedQuestionProductionValidationRecord,
): QuestionProductionValidationRecord => {
  if (input.status === 'PASSED') {
    return {
      candidateOrdinal: input.candidateOrdinal,
      stage: input.stage,
      status: 'PASSED',
      code: null,
      details: input.details,
    };
  }

  if (input.status === 'SKIPPED') {
    return {
      candidateOrdinal: input.candidateOrdinal,
      stage: input.stage,
      status: 'SKIPPED',
      code: 'QUESTION_VALIDATION_SKIPPED',
      details: input.details,
    };
  }

  return {
    candidateOrdinal: input.candidateOrdinal,
    stage: input.stage,
    status: 'FAILED',
    code:
      typeof input.code === 'string' && input.code.trim().length > 0
        ? input.code
        : validationFailureCode(input.stage),
    details: input.details,
  };
};

/** prompt에 필요한 어휘의 공개 가능한 최소 요약 */
export interface QuestionPromptVocabulary {
  thai: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number;
}

/** 기존 게시 문제를 재생성 없이 구분할 제한된 요약 */
export interface QuestionSimilaritySummary {
  difficulty: number;
  summary: string;
}

/** 승인 예시에서 prompt로 전달할 canonical 문제 graph와 제목 */
export interface QuestionPromptApprovedExample {
  title: string;
  payload: GeneratedQuestionPayload;
}

/** processor가 prompt 조립에 사용할 공개 가능한 문제 생성 문맥 */
export interface QuestionProductionContext {
  commonPrinciples: string[];
  typeVersion: {
    id: string;
    slug: string;
    version: number;
    template: QuestionTemplate;
    structureRules: Record<string, unknown>;
    generationRules: Record<string, unknown>;
  };
  difficultyCriteria: Array<{ difficulty: number; criteria: string }>;
  approvedExamples: QuestionPromptApprovedExample[];
  targetVocabulary: QuestionPromptVocabulary[];
  requiredVocabulary: QuestionPromptVocabulary[];
  excludedVocabulary: QuestionPromptVocabulary[];
  newAuxiliaryVocabularyLimit: number;
  similarQuestions: QuestionSimilaritySummary[];
  additionalInstructionKo: string | null;
}

/** provider에 전달할 결정적인 문제 생성 prompt */
export interface QuestionGenerationPrompt {
  promptVersion: string;
  sections: Array<{ name: string; content: unknown }>;
  outputSchema: Record<string, unknown>;
}

const questionGenerationPromptVersion = 'question-generation-v1';

const compareCodeUnitText = (left: string, right: string): number => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const sortPromptValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortPromptValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodeUnitText(left, right))
      .map(([key, item]) => [key, sortPromptValue(item)]),
  );
};

const stablePromptJson = (value: unknown): string =>
  JSON.stringify(sortPromptValue(value));

const compareStablePromptValue = (left: unknown, right: unknown): number => {
  const leftJson = stablePromptJson(left);
  const rightJson = stablePromptJson(right);
  return compareCodeUnitText(leftJson, rightJson);
};

const projectContentReference = (
  reference: GeneratedQuestionSentenceInput['tokens'][number]['vocabulary'],
): { id: string } | { clientRef: string } =>
  reference.id === undefined
    ? { clientRef: reference.clientRef }
    : { id: reference.id };

const projectGeneratedSentence = (
  sentence: GeneratedQuestionSentenceInput,
): GeneratedQuestionSentenceInput => ({
  originalText: sentence.originalText,
  translationKo: sentence.translationKo,
  pronunciationKo: sentence.pronunciationKo,
  toneMarks: sentence.toneMarks,
  tokens: sentence.tokens.map((token) => ({
    surface: token.surface,
    startOffset: token.startOffset,
    endOffset: token.endOffset,
    vocabulary: projectContentReference(token.vocabulary),
    meaning: projectContentReference(token.meaning),
    pronunciation: projectContentReference(token.pronunciation),
    contextMeaningKo: token.contextMeaningKo,
    role: token.role,
  })),
  expressions: sentence.expressions.map((expression) => ({
    startTokenIndex: expression.startTokenIndex,
    endTokenIndex: expression.endTokenIndex,
    vocabulary: projectContentReference(expression.vocabulary),
    meaning: projectContentReference(expression.meaning),
    pronunciation: projectContentReference(expression.pronunciation),
    contextMeaningKo: expression.contextMeaningKo,
    ...(expression.representative === undefined
      ? {}
      : { representative: expression.representative }),
  })),
});

const projectGeneratedOption = (
  option: GeneratedQuestionOptionInput,
): GeneratedQuestionOptionInput =>
  option.sentence === null
    ? {
        clientRef: option.clientRef,
        position: option.position,
        sentence: null,
        span: {
          blockPosition: option.span.blockPosition,
          sentencePosition: option.span.sentencePosition,
          startTokenIndex: option.span.startTokenIndex,
          endTokenIndex: option.span.endTokenIndex,
        },
      }
    : {
        clientRef: option.clientRef,
        position: option.position,
        sentence: projectGeneratedSentence(option.sentence),
        span: null,
      };

const projectApprovedExample = (
  example: QuestionPromptApprovedExample,
): QuestionPromptApprovedExample => ({
  title: example.title,
  payload: {
    questionTypeSlug: example.payload.questionTypeSlug,
    questionTypeVersion: example.payload.questionTypeVersion,
    difficulty: example.payload.difficulty,
    topicSlug: example.payload.topicSlug,
    tagSlugs: [...example.payload.tagSlugs],
    blocks: example.payload.blocks.map((block) => ({
      kind: block.kind,
      displayMode: block.displayMode,
      sentences: block.sentences.map(({ speaker, sentence }) => ({
        speaker,
        sentence: projectGeneratedSentence(sentence),
      })),
    })),
    options: example.payload.options.map(projectGeneratedOption),
    correctOptionRef: example.payload.correctOptionRef,
  },
});

const projectUnknownReference = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  if (isNonemptyString(value.id)) return { id: value.id };
  if (isNonemptyString(value.clientRef)) return { clientRef: value.clientRef };
  return value;
};

const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

const projectUnknownSentence = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  return {
    originalText: value.originalText,
    translationKo: value.translationKo,
    pronunciationKo: value.pronunciationKo,
    toneMarks: value.toneMarks,
    tokens: isUnknownArray(value.tokens)
      ? value.tokens.map((token) =>
          isRecord(token)
            ? {
                surface: token.surface,
                startOffset: token.startOffset,
                endOffset: token.endOffset,
                vocabulary: projectUnknownReference(token.vocabulary),
                meaning: projectUnknownReference(token.meaning),
                pronunciation: projectUnknownReference(token.pronunciation),
                contextMeaningKo: token.contextMeaningKo,
                role: token.role,
              }
            : token,
        )
      : value.tokens,
    expressions: isUnknownArray(value.expressions)
      ? value.expressions.map((expression) =>
          isRecord(expression)
            ? {
                startTokenIndex: expression.startTokenIndex,
                endTokenIndex: expression.endTokenIndex,
                vocabulary: projectUnknownReference(expression.vocabulary),
                meaning: projectUnknownReference(expression.meaning),
                pronunciation: projectUnknownReference(
                  expression.pronunciation,
                ),
                contextMeaningKo: expression.contextMeaningKo,
                ...(typeof expression.representative === 'boolean'
                  ? { representative: expression.representative }
                  : {}),
              }
            : expression,
        )
      : value.expressions,
  };
};

const projectUnknownOption = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  return {
    clientRef: value.clientRef,
    position: value.position,
    sentence:
      value.sentence === null ? null : projectUnknownSentence(value.sentence),
    span:
      value.span === null
        ? null
        : isRecord(value.span)
          ? {
              blockPosition: value.span.blockPosition,
              sentencePosition: value.span.sentencePosition,
              startTokenIndex: value.span.startTokenIndex,
              endTokenIndex: value.span.endTokenIndex,
            }
          : value.span,
  };
};

/** 승인 예시 unknown 입력을 canonical public allow-list로 검증·투영한다 */
export const projectQuestionPromptApprovedExample = (
  value: unknown,
): QuestionPromptApprovedExample => {
  if (
    !isRecord(value) ||
    !isNonemptyString(value.title) ||
    !isRecord(value.payload)
  ) {
    throw new Error('QUESTION_APPROVED_EXAMPLE_INVALID');
  }
  const payload = value.payload;
  const projected = {
    questionTypeVersionId: 'approved-example-projection',
    topicId: 'approved-example-projection',
    tagIds: isUnknownArray(payload.tagSlugs) ? payload.tagSlugs : [],
    difficulty: payload.difficulty,
    payload: {
      questionTypeSlug: payload.questionTypeSlug,
      questionTypeVersion: payload.questionTypeVersion,
      difficulty: payload.difficulty,
      topicSlug: payload.topicSlug,
      tagSlugs: isUnknownArray(payload.tagSlugs)
        ? [...payload.tagSlugs]
        : payload.tagSlugs,
      blocks: isUnknownArray(payload.blocks)
        ? payload.blocks.map((block) =>
            isRecord(block)
              ? {
                  kind: block.kind,
                  displayMode: block.displayMode,
                  sentences: isUnknownArray(block.sentences)
                    ? block.sentences.map((sentence) =>
                        isRecord(sentence)
                          ? {
                              speaker:
                                typeof sentence.speaker === 'string'
                                  ? sentence.speaker
                                  : null,
                              sentence: projectUnknownSentence(
                                sentence.sentence,
                              ),
                            }
                          : sentence,
                      )
                    : block.sentences,
                }
              : block,
          )
        : payload.blocks,
      options: isUnknownArray(payload.options)
        ? payload.options.map(projectUnknownOption)
        : payload.options,
      correctOptionRef: payload.correctOptionRef,
    },
  };
  if (validateGeneratedQuestionSchema(projected).status === 'FAILED') {
    throw new Error('QUESTION_APPROVED_EXAMPLE_INVALID');
  }
  return projectApprovedExample({
    title: value.title,
    payload: projected.payload as GeneratedQuestionPayload,
  });
};

const sortVocabulary = (
  vocabulary: readonly QuestionPromptVocabulary[],
): QuestionPromptVocabulary[] =>
  vocabulary
    .map((item) => ({
      thai: item.thai,
      meaningKo: item.meaningKo,
      partOfSpeech: item.partOfSpeech,
      difficulty: item.difficulty,
    }))
    .sort(compareStablePromptValue);

const contentReferenceSchema = {
  oneOf: [
    {
      additionalProperties: false,
      properties: { id: { type: 'string' } },
      required: ['id'],
      type: 'object',
    },
    {
      additionalProperties: false,
      properties: { clientRef: { type: 'string' } },
      required: ['clientRef'],
      type: 'object',
    },
  ],
};

const generatedSentenceSchema = {
  additionalProperties: false,
  properties: {
    expressions: {
      items: {
        additionalProperties: false,
        properties: {
          contextMeaningKo: { type: 'string' },
          endTokenIndex: { type: 'integer' },
          meaning: contentReferenceSchema,
          pronunciation: contentReferenceSchema,
          representative: { type: 'boolean' },
          startTokenIndex: { type: 'integer' },
          vocabulary: contentReferenceSchema,
        },
        required: [
          'startTokenIndex',
          'endTokenIndex',
          'vocabulary',
          'meaning',
          'pronunciation',
          'contextMeaningKo',
        ],
        type: 'object',
      },
      type: 'array',
    },
    originalText: { type: 'string' },
    pronunciationKo: { type: 'string' },
    tokens: {
      items: {
        additionalProperties: false,
        properties: {
          contextMeaningKo: { type: 'string' },
          endOffset: { type: 'integer' },
          meaning: contentReferenceSchema,
          pronunciation: contentReferenceSchema,
          role: {
            enum: ['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION'],
            type: 'string',
          },
          startOffset: { type: 'integer' },
          surface: { type: 'string' },
          vocabulary: contentReferenceSchema,
        },
        required: [
          'surface',
          'startOffset',
          'endOffset',
          'vocabulary',
          'meaning',
          'pronunciation',
          'contextMeaningKo',
          'role',
        ],
        type: 'object',
      },
      type: 'array',
    },
    toneMarks: { type: 'string' },
    translationKo: { type: 'string' },
  },
  required: [
    'originalText',
    'translationKo',
    'pronunciationKo',
    'toneMarks',
    'tokens',
    'expressions',
  ],
  type: 'object',
};

const generatedBlockSchema = {
  additionalProperties: false,
  properties: {
    displayMode: {
      enum: ['TEXT', 'AUDIO', 'TEXT_AND_AUDIO', 'AUDIO_THEN_REVEAL'],
      type: 'string',
    },
    kind: {
      enum: ['INSTRUCTION', 'PASSAGE', 'DIALOGUE', 'QUESTION', 'EXPLANATION'],
      type: 'string',
    },
    sentences: {
      items: {
        additionalProperties: false,
        properties: {
          sentence: generatedSentenceSchema,
          speaker: { type: ['string', 'null'] },
        },
        required: ['speaker', 'sentence'],
        type: 'object',
      },
      type: 'array',
    },
  },
  required: ['kind', 'displayMode', 'sentences'],
  type: 'object',
};

const generatedOptionSchema = {
  oneOf: [
    {
      additionalProperties: false,
      properties: {
        clientRef: { type: 'string' },
        position: { type: 'integer' },
        sentence: generatedSentenceSchema,
        span: { type: 'null' },
      },
      required: ['clientRef', 'position', 'sentence', 'span'],
      type: 'object',
    },
    {
      additionalProperties: false,
      properties: {
        clientRef: { type: 'string' },
        position: { type: 'integer' },
        sentence: { type: 'null' },
        span: {
          additionalProperties: false,
          properties: {
            blockPosition: { type: 'integer' },
            endTokenIndex: { type: 'integer' },
            sentencePosition: { type: 'integer' },
            startTokenIndex: { type: 'integer' },
          },
          required: [
            'blockPosition',
            'sentencePosition',
            'startTokenIndex',
            'endTokenIndex',
          ],
          type: 'object',
        },
      },
      required: ['clientRef', 'position', 'sentence', 'span'],
      type: 'object',
    },
  ],
};

const generatedPayloadSchema = {
  additionalProperties: false,
  properties: {
    blocks: { items: generatedBlockSchema, type: 'array' },
    correctOptionRef: { type: 'string' },
    difficulty: { minimum: 1, maximum: 5, type: 'integer' },
    options: { items: generatedOptionSchema, type: 'array' },
    questionTypeSlug: { type: 'string' },
    questionTypeVersion: { type: 'integer' },
    tagSlugs: { items: { type: 'string' }, type: 'array' },
    topicSlug: { type: 'string' },
  },
  required: [
    'questionTypeSlug',
    'questionTypeVersion',
    'difficulty',
    'topicSlug',
    'tagSlugs',
    'blocks',
    'options',
    'correctOptionRef',
  ],
  type: 'object',
};

const questionGenerationOutputSchema: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    candidates: {
      items: {
        additionalProperties: false,
        properties: {
          difficulty: { minimum: 1, maximum: 5, type: 'integer' },
          payload: generatedPayloadSchema,
          questionTypeVersionId: { type: 'string' },
          tagIds: { items: { type: 'string' }, type: 'array' },
          topicId: { type: 'string' },
        },
        required: [
          'questionTypeVersionId',
          'topicId',
          'tagIds',
          'difficulty',
          'payload',
        ],
        type: 'object',
      },
      minItems: 1,
      type: 'array',
    },
  },
  required: ['candidates'],
  type: 'object',
};

/** 활성 유형의 1~5 난이도와 승인 예시가 외부 생성 전 준비됐는지 확인한다 */
export const assertQuestionTaxonomyComplete = (
  context: QuestionProductionContext,
): void => {
  if (
    !Number.isSafeInteger(context.newAuxiliaryVocabularyLimit) ||
    context.newAuxiliaryVocabularyLimit < 0
  ) {
    throw new Error('QUESTION_AUXILIARY_VOCABULARY_LIMIT_INVALID');
  }
  if (
    context.difficultyCriteria.length !== 5 ||
    context.difficultyCriteria.some(
      (criterion, index) =>
        criterion.difficulty !== index + 1 || criterion.criteria.trim() === '',
    ) ||
    context.approvedExamples.length === 0
  ) {
    throw new Error('QUESTION_TAXONOMY_INCOMPLETE');
  }
};

/** 공개 taxonomy 자료를 결정적인 JSON section의 문제 생성 prompt로 조립한다 */
export const buildQuestionGenerationPrompt = (
  context: QuestionProductionContext,
): QuestionGenerationPrompt => {
  assertQuestionTaxonomyComplete(context);

  return {
    promptVersion: questionGenerationPromptVersion,
    sections: [
      {
        name: 'common-principles',
        content: stablePromptJson(
          [...context.commonPrinciples].sort(compareCodeUnitText),
        ),
      },
      {
        name: 'question-type',
        content: stablePromptJson({
          generationRules: context.typeVersion.generationRules,
          id: context.typeVersion.id,
          slug: context.typeVersion.slug,
          structureRules: context.typeVersion.structureRules,
          template: context.typeVersion.template,
          version: context.typeVersion.version,
        }),
      },
      {
        name: 'difficulty-criteria',
        content: stablePromptJson(
          [...context.difficultyCriteria].sort(
            (left, right) => left.difficulty - right.difficulty,
          ),
        ),
      },
      {
        name: 'approved-examples',
        content: stablePromptJson(
          context.approvedExamples
            .map(projectQuestionPromptApprovedExample)
            .sort(compareStablePromptValue),
        ),
      },
      {
        name: 'vocabulary-policy',
        content: stablePromptJson({
          excludedVocabulary: sortVocabulary(context.excludedVocabulary),
          requiredVocabulary: sortVocabulary(context.requiredVocabulary),
          targetVocabulary: sortVocabulary(context.targetVocabulary),
        }),
      },
      {
        name: 'new-auxiliary-vocabulary-limit',
        content: context.newAuxiliaryVocabularyLimit,
      },
      {
        name: 'similar-question-summaries',
        content: stablePromptJson(
          [...context.similarQuestions].sort(
            (left, right) =>
              left.difficulty - right.difficulty ||
              compareStablePromptValue(left, right),
          ),
        ),
      },
      {
        name: 'additional-instruction-ko',
        content: context.additionalInstructionKo ?? '',
      },
    ],
    outputSchema: questionGenerationOutputSchema,
  };
};

/** 문제 생성 provider의 입력 */
export interface QuestionGenerationInput {
  prompt: QuestionGenerationPrompt;
  preset: ContentProductionPresetSnapshot;
  signal: AbortSignal;
}

/** 문제 생성 provider의 정규화 응답 */
export interface QuestionGenerationResult {
  candidates: GeneratedQuestionCandidate[];
  usage: Record<string, number>;
  estimatedCostUsd: string;
  providerRequestId: string | null;
}

/** 독립 교차 검증 provider의 입력 */
export interface QuestionCrossValidationInput {
  candidate: GeneratedQuestionCandidate;
  promptVersion: string;
  signal: AbortSignal;
}

/** 독립 교차 검증 provider의 정규화 응답 */
export type QuestionCrossValidationResult =
  | {
      status: 'PASSED';
      code: null;
      evidence: Record<string, unknown>;
      usage: Record<string, number>;
      estimatedCostUsd: string;
      providerRequestId: string | null;
    }
  | {
      status: 'FAILED';
      code: string;
      evidence: Record<string, unknown>;
      usage: Record<string, number>;
      estimatedCostUsd: string;
      providerRequestId: string | null;
    };

/** 문제 생성 provider 실행을 attempt 안에서 유일하게 식별한다 */
export interface QuestionProductionProviderExecution {
  jobItemId: string;
  jobAttempt: number;
  operation: string;
  sequence: number;
  provider: string;
  model: string;
  promptVersion: string;
  itemLeaseToken: string;
}

type ProviderRunMetadata = Partial<{
  usage: Record<string, number>;
  estimatedCostUsd: string;
  providerRequestId: string | null;
}>;

type UnnormalizedQuestionProductionProviderResult =
  | ({
      kind: 'QUESTION_CANDIDATES';
      candidates: GeneratedQuestionCandidate[];
    } & ProviderRunMetadata)
  | ({
      kind: 'QUESTION_VALIDATION';
      status: 'PASSED' | 'FAILED';
      code: string | null;
      evidence: Record<string, unknown>;
    } & ProviderRunMetadata);

/** 문제 생성·교차 검증 provider의 replay 가능한 정규화 결과 */
export type QuestionProductionProviderResult =
  | ({
      kind: 'QUESTION_CANDIDATES';
      candidates: GeneratedQuestionCandidate[];
    } & ProviderRunMetadata)
  | ({
      kind: 'QUESTION_VALIDATION';
      status: 'PASSED';
      code: null;
      evidence: Record<string, unknown>;
    } & ProviderRunMetadata)
  | ({
      kind: 'QUESTION_VALIDATION';
      status: 'FAILED';
      code: string;
      evidence: Record<string, unknown>;
    } & ProviderRunMetadata);

/** provider validation 실패 code 누락을 저장·replay 전 안정 code로 보정한다 */
export const normalizeQuestionProductionProviderResult = (
  input: UnnormalizedQuestionProductionProviderResult,
): QuestionProductionProviderResult => {
  if (input.kind === 'QUESTION_CANDIDATES') return input;

  const metadata: ProviderRunMetadata = {
    ...(input.usage === undefined ? {} : { usage: input.usage }),
    ...(input.estimatedCostUsd === undefined
      ? {}
      : { estimatedCostUsd: input.estimatedCostUsd }),
    ...(input.providerRequestId === undefined
      ? {}
      : { providerRequestId: input.providerRequestId }),
  };
  if (input.status === 'PASSED') {
    return {
      kind: 'QUESTION_VALIDATION',
      status: 'PASSED',
      code: null,
      evidence: input.evidence,
      ...metadata,
    };
  }
  return {
    kind: 'QUESTION_VALIDATION',
    status: 'FAILED',
    code:
      typeof input.code === 'string' && input.code.trim().length > 0
        ? input.code
        : 'QUESTION_CROSS_VALIDATION_FAILED',
    evidence: input.evidence,
    ...metadata,
  };
};

/** 문제 provider 실행의 확정 실패 또는 결과 불명 상태 */
export interface QuestionProductionProviderFailure {
  status: 'FAILED' | 'OUTCOME_UNKNOWN';
  errorCode: string;
  retryable: boolean;
}

/** 공유 provider_runs table 위 문제 결과 전용 replay 저장 port */
export interface QuestionProductionProviderRunRepository {
  claim(
    execution: QuestionProductionProviderExecution,
  ): Promise<
    | { kind: 'CLAIMED'; runId: string }
    | { kind: 'REPLAY'; result: QuestionProductionProviderResult }
    | { kind: 'OUTCOME_UNKNOWN' }
  >;
  succeed(
    runId: string,
    result: QuestionProductionProviderResult,
  ): Promise<boolean>;
  fail(
    runId: string,
    failure: QuestionProductionProviderFailure,
  ): Promise<boolean>;
}

/** 기존 문제와의 유사도 조회 결과 */
export interface QuestionSimilarityMatch {
  questionVersionId: string;
  score: number;
  summary: string;
}

/** 후보 검토 변경에 필요한 감사 문맥 */
export interface QuestionCandidateReviewCommand {
  candidateId: string;
  expectedRevision: number;
  actorUserId: string;
  actorSub: string;
  requestId: string;
  occurredAt: Date;
}

/** 후보 폐기 명령 */
export type DiscardQuestionCandidateInput = QuestionCandidateReviewCommand;

/** 후보 재생성 명령 */
export type RegenerateQuestionCandidateInput = QuestionCandidateReviewCommand;

/** 후보 승인 명령 */
export type ApproveQuestionCandidateInput = QuestionCandidateReviewCommand;

/** 후보 승인으로 만든 게시 전 문제 DRAFT 식별자 */
export interface ApprovedQuestionDraft {
  questionId: string;
  questionVersionId: string;
}

/** 후보 검토 실패를 HTTP 계층이 안정적인 상태 code로 변환하게 한다 */
export class QuestionCandidateReviewError extends Error {
  constructor(
    readonly code:
      | 'QUESTION_CANDIDATE_NOT_APPROVABLE'
      | 'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT'
      | 'QUESTION_CANDIDATE_REVIEW_CONFLICT',
  ) {
    super(code);
    this.name = 'QuestionCandidateReviewError';
  }
}

/** 활성 preset으로 문제 생성 문맥을 조회하는 port */
export interface QuestionProductionContextRepository {
  load(input: {
    preset: ContentProductionPresetSnapshot;
    operation: 'QUESTION_GENERATION';
  }): Promise<QuestionProductionContext>;
}

/** 활성 lease 아래 문제 후보 artifact와 item terminal 결과를 원자 저장한다 */
export interface QuestionProductionCandidateRepository {
  persist(input: {
    jobId: string;
    itemId: string;
    attempt: number;
    leaseToken: string;
    outcome: {
      status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
      retryable: boolean;
      errorCode: string | null;
      result?: Record<string, unknown>;
    };
    artifacts: QuestionProductionArtifacts;
  }): Promise<boolean>;
}

/** 구조화된 문제 후보를 생성하는 AI provider port */
export interface QuestionGenerationProvider {
  generate(input: QuestionGenerationInput): Promise<QuestionGenerationResult>;
}

/** 결정 규칙과 분리된 AI 교차 검증 provider port */
export interface QuestionCrossValidationProvider {
  validate(
    input: QuestionCrossValidationInput,
  ): Promise<QuestionCrossValidationResult>;
}

/** 기존 게시 문제와의 유사도를 조회하는 port */
export interface QuestionSimilarityLookup {
  findSimilar(
    candidate: GeneratedQuestionCandidate,
    limit: 5,
  ): Promise<QuestionSimilarityMatch[]>;
}

/** 승인·폐기·재생성을 원자적으로 기록하는 후보 초안 저장 port */
export interface GeneratedQuestionDraftRepository {
  approve(input: ApproveQuestionCandidateInput): Promise<
    | { kind: 'APPROVED'; questionId: string; questionVersionId: string }
    | {
        kind: 'ALREADY_APPROVED';
        questionId: string;
        questionVersionId: string;
      }
    | { kind: 'CONFLICT' }
  >;
  discard(input: DiscardQuestionCandidateInput): Promise<boolean>;
  requestRegeneration(
    input: RegenerateQuestionCandidateInput,
  ): Promise<{ jobId: string; attempt: number }>;
}

/** 후보 승인·폐기·재생성 결과를 stable domain 오류와 DRAFT 응답으로 정규화한다 */
export class QuestionCandidateReviewService {
  constructor(private readonly repository: GeneratedQuestionDraftRepository) {}

  /** 첫 승인과 동일 request replay를 같은 DRAFT 결과로 반환한다 */
  async approve(
    input: ApproveQuestionCandidateInput,
  ): Promise<ApprovedQuestionDraft> {
    const result = await this.repository.approve(input);
    if (result.kind === 'CONFLICT') {
      throw new QuestionCandidateReviewError(
        'QUESTION_CANDIDATE_REVIEW_CONFLICT',
      );
    }
    return {
      questionId: result.questionId,
      questionVersionId: result.questionVersionId,
    };
  }

  /** PENDING 후보 폐기만 허용하고 terminal·stale 전이는 conflict로 통일한다 */
  async discard(input: DiscardQuestionCandidateInput): Promise<void> {
    if (!(await this.repository.discard(input))) {
      throw new QuestionCandidateReviewError(
        'QUESTION_CANDIDATE_REVIEW_CONFLICT',
      );
    }
  }

  /** 원본 후보를 보존한 새 item attempt 생성 결과를 전달한다 */
  regenerate(
    input: RegenerateQuestionCandidateInput,
  ): Promise<{ jobId: string; attempt: number }> {
    return this.repository.requestRegeneration(input);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  keys.length === Object.keys(value).length &&
  keys.every((key) => Object.hasOwn(value, key));

const isNonemptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

const isContentDraftReference = (value: unknown): boolean => {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    ((keys[0] === 'id' && isNonemptyString(value.id)) ||
      (keys[0] === 'clientRef' && isNonemptyString(value.clientRef)))
  );
};

const isCanonicalToken = (value: unknown): boolean => {
  if (!isRecord(value)) return false;

  return (
    hasExactKeys(value, [
      'surface',
      'startOffset',
      'endOffset',
      'vocabulary',
      'meaning',
      'pronunciation',
      'contextMeaningKo',
      'role',
    ]) &&
    isNonemptyString(value.surface) &&
    isSafeInteger(value.startOffset) &&
    isSafeInteger(value.endOffset) &&
    isContentDraftReference(value.vocabulary) &&
    isContentDraftReference(value.meaning) &&
    isContentDraftReference(value.pronunciation) &&
    isNonemptyString(value.contextMeaningKo) &&
    ['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION'].includes(
      value.role as string,
    )
  );
};

const isCanonicalExpression = (value: unknown): boolean => {
  if (!isRecord(value)) return false;

  const requiredKeys = [
    'startTokenIndex',
    'endTokenIndex',
    'vocabulary',
    'meaning',
    'pronunciation',
    'contextMeaningKo',
  ];
  const keys = Object.keys(value);
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => [...requiredKeys, 'representative'].includes(key)) &&
    isSafeInteger(value.startTokenIndex) &&
    isSafeInteger(value.endTokenIndex) &&
    isContentDraftReference(value.vocabulary) &&
    isContentDraftReference(value.meaning) &&
    isContentDraftReference(value.pronunciation) &&
    isNonemptyString(value.contextMeaningKo) &&
    (value.representative === undefined ||
      typeof value.representative === 'boolean')
  );
};

const containsThaiCodePoint = (value: string): boolean =>
  /\p{Script=Thai}/u.test(value);

const hasValidSentenceOffsets = (
  sentence: GeneratedQuestionSentenceInput,
): boolean => {
  const codePoints = Array.from(sentence.originalText);
  const covered = Array.from({ length: codePoints.length }, () => false);
  let previousEnd = 0;

  for (const token of sentence.tokens) {
    if (
      token.startOffset < 0 ||
      token.endOffset <= token.startOffset ||
      token.endOffset > codePoints.length ||
      token.startOffset < previousEnd
    ) {
      return false;
    }
    const rawSurface = codePoints
      .slice(token.startOffset, token.endOffset)
      .join('');
    if (
      rawSurface !== token.surface ||
      normalizeThaiSearchText(rawSurface) !==
        normalizeThaiSearchText(token.surface)
    ) {
      return false;
    }
    for (let index = token.startOffset; index < token.endOffset; index += 1) {
      covered[index] = true;
    }
    previousEnd = token.endOffset;
  }

  const expressionRanges = new Set<string>();
  for (const expression of sentence.expressions) {
    const range = `${expression.startTokenIndex}:${expression.endTokenIndex}`;
    if (
      expression.startTokenIndex < 0 ||
      expression.endTokenIndex - expression.startTokenIndex < 2 ||
      expression.endTokenIndex > sentence.tokens.length ||
      expressionRanges.has(range)
    ) {
      return false;
    }
    expressionRanges.add(range);
  }

  return codePoints.every(
    (codePoint, index) =>
      !containsThaiCodePoint(codePoint) || covered[index] === true,
  );
};

const isGeneratedSentence = (
  value: unknown,
): value is GeneratedQuestionSentenceInput => {
  if (!isRecord(value)) return false;

  return (
    hasExactKeys(value, [
      'originalText',
      'translationKo',
      'pronunciationKo',
      'toneMarks',
      'tokens',
      'expressions',
    ]) &&
    isNonemptyString(value.originalText) &&
    isNonemptyString(value.translationKo) &&
    isNonemptyString(value.pronunciationKo) &&
    typeof value.toneMarks === 'string' &&
    Array.isArray(value.tokens) &&
    value.tokens.every(isCanonicalToken) &&
    Array.isArray(value.expressions) &&
    value.expressions.every(isCanonicalExpression) &&
    hasValidSentenceOffsets(value as GeneratedQuestionSentenceInput)
  );
};

const isBlock = (value: unknown): boolean => {
  if (!isRecord(value)) return false;

  return (
    hasExactKeys(value, ['kind', 'displayMode', 'sentences']) &&
    ['INSTRUCTION', 'PASSAGE', 'DIALOGUE', 'QUESTION', 'EXPLANATION'].includes(
      value.kind as string,
    ) &&
    ['TEXT', 'AUDIO', 'TEXT_AND_AUDIO', 'AUDIO_THEN_REVEAL'].includes(
      value.displayMode as string,
    ) &&
    Array.isArray(value.sentences) &&
    value.sentences.every(
      (sentence) =>
        isRecord(sentence) &&
        hasExactKeys(sentence, ['speaker', 'sentence']) &&
        (sentence.speaker === null || typeof sentence.speaker === 'string') &&
        isGeneratedSentence(sentence.sentence),
    )
  );
};

const isOption = (value: unknown): boolean => {
  if (!isRecord(value)) return false;

  if (
    !hasExactKeys(value, ['clientRef', 'position', 'sentence', 'span']) ||
    !isNonemptyString(value.clientRef) ||
    !isSafeInteger(value.position)
  ) {
    return false;
  }

  if (value.sentence !== null) {
    return value.span === null && isGeneratedSentence(value.sentence);
  }

  return (
    isRecord(value.span) &&
    hasExactKeys(value.span, [
      'blockPosition',
      'sentencePosition',
      'startTokenIndex',
      'endTokenIndex',
    ]) &&
    isSafeInteger(value.span.blockPosition) &&
    isSafeInteger(value.span.sentencePosition) &&
    isSafeInteger(value.span.startTokenIndex) &&
    isSafeInteger(value.span.endTokenIndex)
  );
};

const hasValidInlineSpan = (
  candidate: GeneratedQuestionCandidate,
  option: GeneratedQuestionOptionInput,
): boolean => {
  if (option.sentence !== null) return true;

  const { span } = option;
  const block = candidate.payload.blocks[span.blockPosition];
  const sentence = block?.sentences[span.sentencePosition]?.sentence;
  return (
    block?.kind === 'QUESTION' &&
    sentence !== undefined &&
    span.blockPosition >= 0 &&
    span.sentencePosition >= 0 &&
    span.startTokenIndex >= 0 &&
    span.endTokenIndex > span.startTokenIndex &&
    span.endTokenIndex <= sentence.tokens.length
  );
};

type AllowedTaxonomyTerm = { id: string; slug: string };

const readAllowedTaxonomyTerms = (
  value: unknown,
): AllowedTaxonomyTerm[] | null => {
  if (!Array.isArray(value)) return null;
  const terms = value.filter(
    (term): term is AllowedTaxonomyTerm =>
      isRecord(term) &&
      isNonemptyString(term.id) &&
      isNonemptyString(term.slug),
  );
  return terms.length === value.length ? terms : null;
};

const hasMatchingTaxonomy = (
  candidate: GeneratedQuestionCandidate,
  context: QuestionProductionContext,
): boolean => {
  const topics = readAllowedTaxonomyTerms(
    context.typeVersion.generationRules['allowedTopics'],
  );
  const tags = readAllowedTaxonomyTerms(
    context.typeVersion.generationRules['allowedTags'],
  );
  const topic = topics?.find(({ id }) => id === candidate.topicId);
  if (
    !topic ||
    topic.slug !== candidate.payload.topicSlug ||
    !tags ||
    candidate.tagIds.length !== candidate.payload.tagSlugs.length
  ) {
    return false;
  }
  return candidate.tagIds.every((id, index) => {
    const tag = tags.find((candidateTag) => candidateTag.id === id);
    return tag?.slug === candidate.payload.tagSlugs[index];
  });
};

const hasValidTemplate = (
  candidate: GeneratedQuestionCandidate,
  template: QuestionTemplate,
): boolean => {
  const blocks = candidate.payload.blocks;
  const hasExactlyOne = (
    kind: GeneratedQuestionPayload['blocks'][number]['kind'],
  ): boolean => blocks.filter((block) => block.kind === kind).length === 1;
  const hasQuestion = hasExactlyOne('QUESTION');
  const hasPassage = blocks.some((block) => block.kind === 'PASSAGE');
  const hasDialogue = blocks.some((block) => block.kind === 'DIALOGUE');
  const inline = template === 'INLINE_SPAN_CHOICE';

  if (
    candidate.payload.options.some(
      (option) => inline !== (option.sentence === null),
    )
  ) {
    return false;
  }
  if (template === 'STANDARD_CHOICE') {
    return hasQuestion && !hasPassage && !hasDialogue;
  }
  if (template === 'PASSAGE_CHOICE') {
    return hasQuestion && hasExactlyOne('PASSAGE') && !hasDialogue;
  }
  if (template === 'INLINE_SPAN_CHOICE') {
    const question = blocks.find((block) => block.kind === 'QUESTION');
    return (
      hasQuestion &&
      !hasPassage &&
      !hasDialogue &&
      question?.sentences.length === 1
    );
  }
  const dialogue = blocks.find((block) => block.kind === 'DIALOGUE');
  return (
    hasQuestion &&
    hasExactlyOne('DIALOGUE') &&
    !hasPassage &&
    Boolean(
      dialogue?.sentences.every(({ speaker }) => Boolean(speaker?.trim())),
    )
  );
};

const generatedSentences = (
  candidate: GeneratedQuestionCandidate,
): GeneratedQuestionSentenceInput[] => [
  ...candidate.payload.blocks.flatMap((block) =>
    block.sentences.map(({ sentence }) => sentence),
  ),
  ...candidate.payload.options.flatMap((option) =>
    option.sentence === null ? [] : [option.sentence],
  ),
];

const generatedVocabularySurfaces = (
  sentence: GeneratedQuestionSentenceInput,
): string[] => {
  const codePoints = Array.from(sentence.originalText);
  return [
    ...sentence.tokens.map(({ surface }) => surface),
    ...sentence.expressions.map((expression) => {
      const first = sentence.tokens[expression.startTokenIndex]!;
      const last = sentence.tokens[expression.endTokenIndex - 1]!;
      return codePoints.slice(first.startOffset, last.endOffset).join('');
    }),
  ];
};

const hasValidVocabularyPolicy = (
  candidate: GeneratedQuestionCandidate,
  context: QuestionProductionContext,
): boolean => {
  const sentences = generatedSentences(candidate);
  const tokens = sentences.flatMap((sentence) => sentence.tokens);
  const surfaces = new Set(
    sentences.flatMap(generatedVocabularySurfaces).map(normalizeThaiSearchText),
  );
  const target = new Set(
    context.targetVocabulary.map(({ thai }) => normalizeThaiSearchText(thai)),
  );
  const required = new Set(
    context.requiredVocabulary.map(({ thai }) => normalizeThaiSearchText(thai)),
  );
  const excluded = new Set(
    context.excludedVocabulary.map(({ thai }) => normalizeThaiSearchText(thai)),
  );
  if (
    [...target, ...required].some((thai) => !surfaces.has(thai)) ||
    [...excluded].some((thai) => surfaces.has(thai))
  ) {
    return false;
  }
  const auxiliary = new Set(
    tokens
      .filter(({ role }) => role === 'SUPPORTING')
      .map(({ surface }) => normalizeThaiSearchText(surface))
      .filter((thai) => !target.has(thai) && !required.has(thai)),
  );
  return auxiliary.size <= context.newAuxiliaryVocabularyLimit;
};

/** provider 경계에서 canonical 문제 후보의 정확한 JSON shape를 확인한다 */
export const validateGeneratedQuestionSchema = (
  candidate: unknown,
): QuestionValidationResult => {
  if (!isRecord(candidate)) {
    return { status: 'FAILED', code: 'QUESTION_SCHEMA_INVALID' };
  }

  const payload = candidate.payload;
  const valid =
    hasExactKeys(candidate, [
      'questionTypeVersionId',
      'topicId',
      'tagIds',
      'difficulty',
      'payload',
    ]) &&
    isNonemptyString(candidate.questionTypeVersionId) &&
    isNonemptyString(candidate.topicId) &&
    Array.isArray(candidate.tagIds) &&
    candidate.tagIds.every(isNonemptyString) &&
    isSafeInteger(candidate.difficulty) &&
    isRecord(payload) &&
    hasExactKeys(payload, [
      'questionTypeSlug',
      'questionTypeVersion',
      'difficulty',
      'topicSlug',
      'tagSlugs',
      'blocks',
      'options',
      'correctOptionRef',
    ]) &&
    isNonemptyString(payload.questionTypeSlug) &&
    isSafeInteger(payload.questionTypeVersion) &&
    isSafeInteger(payload.difficulty) &&
    isNonemptyString(payload.topicSlug) &&
    Array.isArray(payload.tagSlugs) &&
    payload.tagSlugs.every(isNonemptyString) &&
    Array.isArray(payload.blocks) &&
    payload.blocks.every(isBlock) &&
    Array.isArray(payload.options) &&
    payload.options.every(isOption) &&
    isNonemptyString(payload.correctOptionRef);

  return valid
    ? { status: 'PASSED', code: null }
    : { status: 'FAILED', code: 'QUESTION_SCHEMA_INVALID' };
};

/** schema를 통과한 후보가 문제 graph의 최소 결정 규칙을 만족하는지 검증한다 */
export const validateQuestionDecisionRules = (
  candidate: GeneratedQuestionCandidate,
  context: QuestionProductionContext,
): QuestionValidationResult => {
  const schema = validateGeneratedQuestionSchema(candidate);
  if (schema.status === 'FAILED') {
    return { status: 'FAILED', code: 'QUESTION_RULE_INVALID' };
  }

  const optionRefs = candidate.payload.options.map(
    (option) => option.clientRef,
  );
  const optionCount = context.typeVersion.structureRules['optionCount'];
  const valid =
    candidate.questionTypeVersionId === context.typeVersion.id &&
    candidate.payload.questionTypeSlug === context.typeVersion.slug &&
    candidate.payload.questionTypeVersion === context.typeVersion.version &&
    hasMatchingTaxonomy(candidate, context) &&
    candidate.difficulty >= 1 &&
    candidate.difficulty <= 5 &&
    candidate.payload.difficulty === candidate.difficulty &&
    isSafeInteger(optionCount) &&
    candidate.payload.options.length === optionCount &&
    optionRefs.length === new Set(optionRefs).size &&
    candidate.payload.options.every(
      (option, index) =>
        option.position === index && hasValidInlineSpan(candidate, option),
    ) &&
    optionRefs.includes(candidate.payload.correctOptionRef) &&
    candidate.payload.blocks.filter((block) => block.kind === 'QUESTION')
      .length === 1 &&
    hasValidTemplate(candidate, context.typeVersion.template) &&
    hasValidVocabularyPolicy(candidate, context) &&
    candidate.tagIds.length === new Set(candidate.tagIds).size &&
    candidate.payload.tagSlugs.length ===
      new Set(candidate.payload.tagSlugs).size;

  return valid
    ? { status: 'PASSED', code: null }
    : { status: 'FAILED', code: 'QUESTION_RULE_INVALID' };
};

/** 검증 단계 우선순위로 후보의 검토 그룹과 안정적인 대표 code를 계산한다 */
export const classifyQuestionCandidate = (
  validations: readonly Pick<
    QuestionProductionValidationRecord,
    'stage' | 'status'
  >[],
): QuestionCandidateClassification => {
  const failed = (stage: QuestionValidationStage): boolean =>
    validations.some(
      (validation) =>
        validation.stage === stage && validation.status === 'FAILED',
    );

  if (failed('SCHEMA')) {
    return { group: 'FAILED', code: 'QUESTION_SCHEMA_INVALID' };
  }
  if (failed('DECISION_RULE')) {
    return { group: 'FAILED', code: 'QUESTION_RULE_INVALID' };
  }
  if (failed('SIMILARITY')) {
    return { group: 'NEEDS_ATTENTION', code: 'QUESTION_SIMILARITY_REVIEW' };
  }
  if (failed('AI_CROSS_VALIDATION')) {
    return {
      group: 'NEEDS_ATTENTION',
      code: 'QUESTION_CROSS_VALIDATION_FAILED',
    };
  }
  return { group: 'NORMAL', code: null };
};

/** 생성과 교차 검증이 같은 model 판단을 공유하지 못하게 fail-fast 한다 */
export const assertDistinctValidationModels = (
  generationModel: string,
  crossValidationModel: string,
): void => {
  if (generationModel === crossValidationModel) {
    throw new Error('QUESTION_VALIDATION_MODEL_DUPLICATE');
  }
};
