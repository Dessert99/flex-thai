/** AI 문제 제작 후보의 순수 모델·검증 규칙과 외부 port를 정의한다 */
import type { CanonicalDraftSentenceInput } from '../content-import/content-import.js';
import type { ContentProductionPresetSnapshot } from './content-production.service.js';

/** 후보 검토 우선순위를 나타내는 내부 그룹 */
export type QuestionCandidateGroup = 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';

/** 후보의 관리자 검토 lifecycle 상태 */
export type QuestionCandidateReviewStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DISCARDED';

/** 후보 검증을 기록하는 단계 */
export type QuestionValidationStage =
  | 'SCHEMA'
  | 'DECISION_RULE'
  | 'SIMILARITY'
  | 'AI_CROSS_VALIDATION';

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
    kind:
      | 'INSTRUCTION'
      | 'PASSAGE'
      | 'DIALOGUE'
      | 'QUESTION'
      | 'EXPLANATION';
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

/** 저장되는 후보별 검증 결과 */
export interface QuestionProductionValidationRecord {
  candidateOrdinal: number;
  stage: QuestionValidationStage;
  status: 'PASSED' | 'FAILED';
  code: string | null;
  details: Record<string, unknown>;
}

/** 후보 규칙이 반환하는 단일 검증 결과 */
export interface QuestionValidationResult {
  status: 'PASSED' | 'FAILED';
  code: 'QUESTION_SCHEMA_INVALID' | 'QUESTION_RULE_INVALID' | null;
}

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

/** processor가 prompt 조립에 사용할 문제 생성 문맥의 확장 지점 */
export interface QuestionProductionContext {}

/** provider에 전달할 결정적인 문제 생성 prompt */
export interface QuestionGenerationPrompt {
  promptVersion: string;
  sections: Array<{ name: string; content: unknown }>;
  outputSchema: Record<string, unknown>;
}

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
export interface QuestionCrossValidationResult {
  status: 'PASSED' | 'FAILED';
  code: string | null;
  evidence: Record<string, unknown>;
  usage: Record<string, number>;
  estimatedCostUsd: string;
  providerRequestId: string | null;
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

/** 활성 preset으로 문제 생성 문맥을 조회하는 port */
export interface QuestionProductionContextRepository {
  load(input: {
    preset: ContentProductionPresetSnapshot;
    operation: 'QUESTION_GENERATION';
  }): Promise<QuestionProductionContext>;
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
    Array.isArray(value.expressions)
  );
};

const isBlock = (value: unknown): boolean => {
  if (!isRecord(value)) return false;

  return (
    hasExactKeys(value, ['kind', 'displayMode', 'sentences']) &&
    [
      'INSTRUCTION',
      'PASSAGE',
      'DIALOGUE',
      'QUESTION',
      'EXPLANATION',
    ].includes(value.kind as string) &&
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
): QuestionValidationResult => {
  const schema = validateGeneratedQuestionSchema(candidate);
  if (schema.status === 'FAILED') {
    return { status: 'FAILED', code: 'QUESTION_RULE_INVALID' };
  }

  const optionRefs = candidate.payload.options.map((option) => option.clientRef);
  const valid =
    candidate.difficulty >= 1 &&
    candidate.difficulty <= 5 &&
    candidate.payload.difficulty === candidate.difficulty &&
    candidate.payload.options.length > 0 &&
    optionRefs.length === new Set(optionRefs).size &&
    candidate.payload.options.every(
      (option, index) => option.position === index,
    ) &&
    optionRefs.includes(candidate.payload.correctOptionRef) &&
    candidate.payload.blocks.filter((block) => block.kind === 'QUESTION')
      .length === 1 &&
    candidate.tagIds.length === new Set(candidate.tagIds).size &&
    candidate.payload.tagSlugs.length === new Set(candidate.payload.tagSlugs).size;

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
