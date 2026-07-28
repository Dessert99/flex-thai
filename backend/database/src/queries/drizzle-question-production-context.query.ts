/** 활성 문제 taxonomy와 preset의 공개 정책만 AI 생성 prompt 문맥으로 조회한다 */
import { and, asc, eq } from 'drizzle-orm';
import { projectQuestionPromptApprovedExample } from '@flex-thia/domain';
import type {
  ContentProductionPresetSnapshot,
  QuestionGenerationItemPlan,
  QuestionProductionContext,
  QuestionProductionContextRepository,
  QuestionPromptVocabulary,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionTags,
  questionTopics,
  questionTypeApprovedExamples,
  questionTypeDifficultyCriteria,
  questionTypes,
  questionTypeVersions,
} from '../schema/questions.schema.js';

type ContextTermRow = { id: string; slug: string; displayName: string };
type ContextTypeVersionRow = {
  id: string;
  slug: string;
  version: number;
  template:
    | 'STANDARD_CHOICE'
    | 'PASSAGE_CHOICE'
    | 'DIALOGUE_CHOICE'
    | 'INLINE_SPAN_CHOICE';
  optionCount: number;
  decisionRules: Record<string, unknown>;
};

/** 활성 문제 유형에서 prompt로 노출해도 되는 taxonomy row 묶음 */
export interface QuestionProductionContextRows {
  typeVersion: ContextTypeVersionRow | null;
  difficultyCriteria: Array<{ difficulty: number; criteria: string }>;
  approvedExamples: Array<{
    id: string;
    title: string;
    payload: Record<string, unknown>;
  }>;
  topics: ContextTermRow[];
  tags: ContextTermRow[];
}

type QuestionProductionPresetPolicy = {
  commonPrinciples: string[];
  targetVocabulary: QuestionPromptVocabulary[];
  requiredVocabulary: QuestionPromptVocabulary[];
  excludedVocabulary: QuestionPromptVocabulary[];
  newAuxiliaryVocabularyLimit: number;
  similarQuestions: Array<{ difficulty: number; summary: string }>;
  additionalInstructionKo: string | null;
  similarityThreshold: number;
  speakerRoles: string[];
};

type QuerySchema = {
  questionTags: typeof questionTags;
  questionTopics: typeof questionTopics;
  questionTypeApprovedExamples: typeof questionTypeApprovedExamples;
  questionTypeDifficultyCriteria: typeof questionTypeDifficultyCriteria;
  questionTypes: typeof questionTypes;
  questionTypeVersions: typeof questionTypeVersions;
};
type QueryDatabase = PgDatabase<PgQueryResultHKT, QuerySchema>;

const compareText = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const sortTerms = (terms: ContextTermRow[]): ContextTermRow[] =>
  [...terms].sort(
    (left, right) =>
      compareText(left.slug, right.slug) || compareText(left.id, right.id),
  );

const isVocabulary = (value: unknown): value is QuestionPromptVocabulary =>
  value !== null &&
  typeof value === 'object' &&
  'thai' in value &&
  'meaningKo' in value &&
  'partOfSpeech' in value &&
  'difficulty' in value &&
  typeof value.thai === 'string' &&
  typeof value.meaningKo === 'string' &&
  typeof value.partOfSpeech === 'string' &&
  typeof value.difficulty === 'number';

const readVocabulary = (
  parameters: Record<string, unknown>,
  key: 'targetVocabulary' | 'requiredVocabulary' | 'excludedVocabulary',
): QuestionPromptVocabulary[] =>
  Array.isArray(parameters[key])
    ? parameters[key]
        .filter(isVocabulary)
        .sort(
          (left, right) =>
            compareText(left.thai, right.thai) ||
            compareText(left.meaningKo, right.meaningKo) ||
            compareText(left.partOfSpeech, right.partOfSpeech) ||
            left.difficulty - right.difficulty,
        )
    : [];

const readTextList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .sort(compareText)
    : [];

/** provider 정책의 유사 문제 요약을 unknown 경계에서 안전하게 좁힌다 */
const isSimilarQuestion = (
  value: unknown,
): value is { difficulty: number; summary: string } => {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { difficulty?: unknown; summary?: unknown };
  return (
    typeof candidate.difficulty === 'number' &&
    typeof candidate.summary === 'string'
  );
};

const readSimilarQuestions = (
  value: unknown,
): Array<{ difficulty: number; summary: string }> =>
  Array.isArray(value)
    ? value
        .filter(isSimilarQuestion)
        .sort(
          (left, right) =>
            left.difficulty - right.difficulty ||
            compareText(left.summary, right.summary),
        )
    : [];

const readSpeakerRoles = (value: unknown): string[] => {
  const assignments: unknown[] = Array.isArray(value) ? value : [];
  return assignments.flatMap((assignment) => {
    if (!assignment || typeof assignment !== 'object') return [];
    const record = assignment as Record<string, unknown>;
    const speakerRole = record['speakerRole'];
    return typeof speakerRole === 'string' && speakerRole.trim().length > 0
      ? [speakerRole.trim()]
      : [];
  });
};

/** preset snapshot에서 prompt에 안전한 정책만 선택한다 */
export const readQuestionProductionPresetPolicy = (
  parameters: Record<string, unknown>,
): QuestionProductionPresetPolicy => {
  const newAuxiliaryVocabularyLimit = parameters.newAuxiliaryVocabularyLimit;
  if (
    !Number.isSafeInteger(newAuxiliaryVocabularyLimit) ||
    typeof newAuxiliaryVocabularyLimit !== 'number' ||
    newAuxiliaryVocabularyLimit < 0
  ) {
    throw new Error('QUESTION_AUXILIARY_VOCABULARY_LIMIT_INVALID');
  }
  return {
    commonPrinciples: readTextList(parameters.commonPrinciples),
    targetVocabulary: readVocabulary(parameters, 'targetVocabulary'),
    requiredVocabulary: readVocabulary(parameters, 'requiredVocabulary'),
    excludedVocabulary: readVocabulary(parameters, 'excludedVocabulary'),
    newAuxiliaryVocabularyLimit,
    similarQuestions: readSimilarQuestions(parameters.similarQuestions),
    additionalInstructionKo:
      typeof parameters.additionalInstructionKo === 'string'
        ? parameters.additionalInstructionKo
        : null,
    similarityThreshold:
      typeof parameters.similarityThreshold === 'number'
        ? parameters.similarityThreshold
        : 0,
    speakerRoles: readSpeakerRoles(parameters.speakerVoiceAssignments),
  };
};

/** flat taxonomy와 preset 정책을 provider용 public context로 안정 조립한다 */
export const assembleQuestionProductionContext = (
  rows: QuestionProductionContextRows,
  policy: Partial<QuestionProductionPresetPolicy>,
  questionPlan: QuestionGenerationItemPlan = {
    questionPlanIndex: 0,
    questionTypeVersionId: rows.typeVersion?.id ?? '',
    difficulty: 1,
  },
): QuestionProductionContext | null => {
  if (!rows.typeVersion) return null;

  const allowedTopics = sortTerms(rows.topics);
  const allowedTags = sortTerms(rows.tags);
  return {
    difficulty: questionPlan.difficulty,
    similarityThreshold: policy.similarityThreshold ?? 0,
    speakerRoles: [...(policy.speakerRoles ?? [])]
      .map((role) => role.trim())
      .filter(Boolean)
      .sort(compareText),
    commonPrinciples: [...(policy.commonPrinciples ?? [])].sort(compareText),
    typeVersion: {
      id: rows.typeVersion.id,
      slug: rows.typeVersion.slug,
      version: rows.typeVersion.version,
      template: rows.typeVersion.template,
      structureRules: {
        optionCount: rows.typeVersion.optionCount,
        template: rows.typeVersion.template,
      },
      generationRules: {
        ...rows.typeVersion.decisionRules,
        allowedTopics,
        allowedTags,
      },
    },
    difficultyCriteria: [...rows.difficultyCriteria].sort(
      (left, right) => left.difficulty - right.difficulty,
    ),
    approvedExamples: [...rows.approvedExamples]
      .sort(
        (left, right) =>
          compareText(left.title, right.title) ||
          compareText(left.id, right.id),
      )
      .map(({ title, payload }) =>
        projectQuestionPromptApprovedExample({ title, payload }),
      ),
    targetVocabulary: [...(policy.targetVocabulary ?? [])].sort(
      (left, right) =>
        compareText(left.thai, right.thai) ||
        compareText(left.meaningKo, right.meaningKo) ||
        compareText(left.partOfSpeech, right.partOfSpeech) ||
        left.difficulty - right.difficulty,
    ),
    requiredVocabulary: [...(policy.requiredVocabulary ?? [])].sort(
      (left, right) =>
        compareText(left.thai, right.thai) ||
        compareText(left.meaningKo, right.meaningKo) ||
        compareText(left.partOfSpeech, right.partOfSpeech) ||
        left.difficulty - right.difficulty,
    ),
    excludedVocabulary: [...(policy.excludedVocabulary ?? [])].sort(
      (left, right) =>
        compareText(left.thai, right.thai) ||
        compareText(left.meaningKo, right.meaningKo) ||
        compareText(left.partOfSpeech, right.partOfSpeech) ||
        left.difficulty - right.difficulty,
    ),
    newAuxiliaryVocabularyLimit: policy.newAuxiliaryVocabularyLimit ?? 0,
    similarQuestions: policy.similarQuestions ?? [],
    additionalInstructionKo: policy.additionalInstructionKo ?? null,
  };
};

/** 활성 유형 버전과 공개 taxonomy를 읽어 문제 생성 문맥을 제공한다 */
export class DrizzleQuestionProductionContextQuery implements QuestionProductionContextRepository {
  constructor(private readonly database: QueryDatabase) {}

  /** preset이 가리키는 ACTIVE 유형만 provider 문맥으로 반환한다 */
  async load(input: {
    preset: ContentProductionPresetSnapshot;
    operation: 'QUESTION_GENERATION';
    questionPlan: QuestionGenerationItemPlan;
  }): Promise<QuestionProductionContext> {
    const typeVersionId = input.questionPlan.questionTypeVersionId;

    const [typeVersion] = await this.database
      .select({
        id: questionTypeVersions.id,
        slug: questionTypes.slug,
        version: questionTypeVersions.version,
        template: questionTypeVersions.template,
        optionCount: questionTypeVersions.optionCount,
        decisionRules: questionTypeVersions.decisionRules,
      })
      .from(questionTypeVersions)
      .innerJoin(
        questionTypes,
        eq(questionTypeVersions.questionTypeId, questionTypes.id),
      )
      .where(
        and(
          eq(questionTypeVersions.id, typeVersionId),
          eq(questionTypeVersions.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    const [difficultyCriteria, approvedExamples, topics, tags] =
      await Promise.all([
        this.database
          .select({
            difficulty: questionTypeDifficultyCriteria.difficulty,
            criteria: questionTypeDifficultyCriteria.criteria,
          })
          .from(questionTypeDifficultyCriteria)
          .where(
            eq(questionTypeDifficultyCriteria.typeVersionId, typeVersionId),
          )
          .orderBy(asc(questionTypeDifficultyCriteria.difficulty)),
        this.database
          .select({
            id: questionTypeApprovedExamples.id,
            title: questionTypeApprovedExamples.title,
            payload: questionTypeApprovedExamples.payload,
          })
          .from(questionTypeApprovedExamples)
          .where(eq(questionTypeApprovedExamples.typeVersionId, typeVersionId))
          .orderBy(
            asc(questionTypeApprovedExamples.title),
            asc(questionTypeApprovedExamples.id),
          ),
        this.database
          .select({
            id: questionTopics.id,
            slug: questionTopics.slug,
            displayName: questionTopics.displayName,
          })
          .from(questionTopics)
          .where(eq(questionTopics.status, 'ACTIVE'))
          .orderBy(asc(questionTopics.slug), asc(questionTopics.id)),
        this.database
          .select({
            id: questionTags.id,
            slug: questionTags.slug,
            displayName: questionTags.displayName,
          })
          .from(questionTags)
          .where(eq(questionTags.status, 'ACTIVE'))
          .orderBy(asc(questionTags.slug), asc(questionTags.id)),
      ]);
    const context = assembleQuestionProductionContext(
      {
        typeVersion: typeVersion
          ? {
              ...typeVersion,
              template: typeVersion.template,
            }
          : null,
        difficultyCriteria,
        approvedExamples,
        topics,
        tags,
      },
      readQuestionProductionPresetPolicy(input.preset.parameters),
      input.questionPlan,
    );
    if (!context) throw new Error('QUESTION_TYPE_VERSION_UNAVAILABLE');
    return context;
  }
}
