/** 학습자 read/write 결과를 private key 없는 strict 공개 응답으로 조립한다 */
import {
  questionAttemptListResponseSchema,
  questionDetailResponseSchema,
  questionListResponseSchema,
  submitQuestionAttemptResponseSchema,
  type QuestionAttemptListQuery,
  type QuestionAttemptListResponse,
  type QuestionDetailResponse,
  type QuestionListQuery,
  type QuestionListResponse,
  type SubmitQuestionAttemptRequest,
  type SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts/learning/questions';
import {
  vocabularyDetailResponseSchema,
  vocabularyListResponseSchema,
  vocabularyRelatedQuestionsResponseSchema,
  type VocabularyDetailResponse,
  type VocabularyListQuery,
  type VocabularyListResponse,
  type VocabularyRelatedQuestionsQuery,
  type VocabularyRelatedQuestionsResponse,
} from '@flex-thia/contracts/learning/vocabularies';
import {
  type DrizzleLearnerQuestionQuery,
  type LearnerQuestionListFacetsProjection,
  type LearnerQuestionListItemProjection,
  type LearnerQuestionListQuery,
} from '@flex-thia/database/queries/drizzle-learner-question.query';
import {
  type DrizzleLearnerVocabularyQuery,
  type LearnerVocabularyListQuery,
  type LearnerVocabularySummaryProjection,
} from '@flex-thia/database/queries/drizzle-learner-vocabulary.query';
import { type QuestionAttemptService } from '@flex-thia/domain/learning/question-attempt';
import { type SavedContentService } from '@flex-thia/domain/learning/saved-content';
import { NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';

type QuestionQuery = Pick<
  DrizzleLearnerQuestionQuery,
  'getQuestionDetail' | 'listAttempts' | 'listQuestionFacets' | 'listQuestions'
>;

type VocabularyQuery = Pick<
  DrizzleLearnerVocabularyQuery,
  'getVocabularyDetail' | 'listRelatedQuestions' | 'listVocabularies'
>;

type QuestionAttempts = Pick<QuestionAttemptService, 'submit'>;
type SavedContent = Pick<
  SavedContentService,
  'removeQuestion' | 'saveQuestion'
>;

interface LearnerContentDependencies {
  questionQuery: QuestionQuery;
  vocabularyQuery: VocabularyQuery;
  questionAttempts: QuestionAttempts;
  savedContent: SavedContent;
  now?: () => Date;
}

/** 내부 응답 계약 실패의 Zod issue를 HTTP request 오류와 분리한다 */
export class LearnerPublicResponseError extends Error {
  constructor() {
    super('LEARNER_PUBLIC_RESPONSE_INVALID');
    this.name = 'LearnerPublicResponseError';
  }
}

/** 공개 응답 schema 실패를 내부 필드가 없는 generic 오류로 바꾼다 */
export const parseLearnerPublicResponse = <Output>(
  schema: ZodType<Output>,
  value: unknown,
): Output => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new LearnerPublicResponseError();
  }
  return result.data;
};

const toQuestionListQuery = (
  query: QuestionListQuery,
): LearnerQuestionListQuery => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.skill === undefined ? {} : { skill: query.skill }),
  ...(query.majorCategory === undefined
    ? {}
    : { majorCategory: query.majorCategory }),
  ...(query.questionTypeId === undefined
    ? {}
    : { questionTypeId: query.questionTypeId }),
  ...(query.topicId === undefined ? {} : { topicId: query.topicId }),
  ...(query.tagId === undefined ? {} : { tagId: query.tagId }),
  ...(query.difficulty === undefined ? {} : { difficulty: query.difficulty }),
  ...(query.saved === undefined ? {} : { saved: query.saved }),
  ...(query.firstResult === undefined
    ? {}
    : { firstResult: query.firstResult }),
  sort: query.sort,
});

/** DB 탐색 projection을 공개 계약 필드만 남겨 직렬화한다 */
const mapQuestionListItem = (item: LearnerQuestionListItemProjection) => ({
  questionId: item.questionId,
  questionVersion: item.questionVersion,
  questionType: {
    id: item.questionType.id,
    slug: item.questionType.slug,
    displayName: item.questionType.displayName,
  },
  majorCategory: item.majorCategory,
  topic: {
    id: item.topic.id,
    slug: item.topic.slug,
    displayName: item.topic.displayName,
  },
  tags: item.tags.map((tag) => ({
    id: tag.id,
    slug: tag.slug,
    displayName: tag.displayName,
  })),
  skill: item.skill,
  difficulty: item.difficulty,
  saved: item.saved,
  firstResult: item.firstResult,
});

/** 실제 공개 필터 선택지 projection만 contract 모양으로 직렬화한다 */
const mapQuestionListFacets = (
  facets: LearnerQuestionListFacetsProjection,
) => ({
  majorCategories: facets.majorCategories.map((category) => ({
    value: category.value,
    label: category.label,
  })),
  questionTypes: facets.questionTypes.map((questionType) => ({
    id: questionType.id,
    slug: questionType.slug,
    displayName: questionType.displayName,
    majorCategory: questionType.majorCategory,
  })),
  topics: facets.topics.map((topic) => ({
    id: topic.id,
    slug: topic.slug,
    displayName: topic.displayName,
  })),
  tags: facets.tags.map((tag) => ({
    id: tag.id,
    slug: tag.slug,
    displayName: tag.displayName,
  })),
});

const toVocabularyListQuery = (
  query: VocabularyListQuery,
): LearnerVocabularyListQuery => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.query === undefined ? {} : { query: query.query }),
  ...(query.kind === undefined ? {} : { kind: query.kind }),
  ...(query.partOfSpeech === undefined
    ? {}
    : { partOfSpeech: query.partOfSpeech }),
  ...(query.difficulty === undefined ? {} : { difficulty: query.difficulty }),
});

const mapVocabularySummary = (
  vocabulary: LearnerVocabularySummaryProjection,
) => ({
  id: vocabulary.id,
  thai: vocabulary.thai,
  kind: vocabulary.kind,
  meanings: vocabulary.meanings,
  saved: vocabulary.saved,
});

export class LearnerContentService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: LearnerContentDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** 현재 공개 문제 목록을 strict 정답 없는 계약으로 반환한다 */
  async listQuestions(
    userId: string,
    query: QuestionListQuery,
  ): Promise<QuestionListResponse> {
    const [result, facets] = await Promise.all([
      this.dependencies.questionQuery.listQuestions(
        userId,
        toQuestionListQuery(query),
      ),
      this.dependencies.questionQuery.listQuestionFacets(),
    ]);
    return parseLearnerPublicResponse(questionListResponseSchema, {
      items: result.items.map(mapQuestionListItem),
      page: {
        page: result.page.page,
        pageSize: result.page.pageSize,
        totalItems: result.page.totalItems,
        totalPages: result.page.totalPages,
      },
      facets: mapQuestionListFacets(facets),
    });
  }

  /** 현재 공개 문제의 private media만 5분 URL로 바꿔 반환한다 */
  async getQuestionDetail(
    userId: string,
    questionId: string,
  ): Promise<QuestionDetailResponse> {
    const detail = await this.dependencies.questionQuery.getQuestionDetail(
      userId,
      questionId,
    );
    if (!detail) {
      throw new NotFoundException({ code: 'QUESTION_NOT_FOUND' });
    }
    return parseLearnerPublicResponse(questionDetailResponseSchema, detail);
  }

  /** 답안을 저장한 historical version의 정답과 해설만 제출 뒤 반환한다 */
  async submitQuestionAttempt(
    userId: string,
    questionId: string,
    request: SubmitQuestionAttemptRequest,
  ): Promise<SubmitQuestionAttemptResponse> {
    const result = await this.dependencies.questionAttempts.submit({
      userId,
      questionId,
      ...request,
    });
    return parseLearnerPublicResponse(submitQuestionAttemptResponseSchema, {
      attempt: {
        id: result.attempt.id,
        attemptNo: result.attempt.attemptNo,
        isFirst: result.attempt.attemptNo === 1,
        isCorrect: result.attempt.isCorrect,
        selectedOptionId: result.attempt.selectedOptionId,
        submittedAt: result.attempt.submittedAt.toISOString(),
      },
      feedback: {
        correctOptionId: result.feedback.correctOptionId,
        explanation: result.feedback.explanation,
      },
    });
  }

  /** append-only 풀이 기록의 Date를 ISO 문자열로 제한해 반환한다 */
  async listAttempts(
    userId: string,
    query: QuestionAttemptListQuery,
  ): Promise<QuestionAttemptListResponse> {
    const result = await this.dependencies.questionQuery.listAttempts(
      userId,
      query,
    );
    return parseLearnerPublicResponse(questionAttemptListResponseSchema, {
      ...result,
      items: result.items.map((attempt) => ({
        ...attempt,
        submittedAt: attempt.submittedAt.toISOString(),
      })),
    });
  }

  /** 현재 공개 문제를 현재 시각으로 멱등 저장한다 */
  saveQuestion(userId: string, questionId: string): Promise<void> {
    return this.dependencies.savedContent.saveQuestion(
      userId,
      questionId,
      this.now(),
    );
  }

  /** 문제 공개 상태와 무관하게 저장 연결을 멱등 제거한다 */
  removeQuestion(userId: string, questionId: string): Promise<void> {
    return this.dependencies.savedContent.removeQuestion(userId, questionId);
  }

  /** 게시 어휘 목록의 모든 private media를 response-local URL로 바꾼다 */
  async listVocabularies(
    userId: string,
    query: VocabularyListQuery,
  ): Promise<VocabularyListResponse> {
    const result = await this.dependencies.vocabularyQuery.listVocabularies(
      userId,
      toVocabularyListQuery(query),
    );
    return parseLearnerPublicResponse(vocabularyListResponseSchema, {
      ...result,
      items: result.items.map((item) => mapVocabularySummary(item)),
    });
  }

  async getVocabularyDetail(
    userId: string,
    vocabularyId: string,
  ): Promise<VocabularyDetailResponse> {
    const detail = await this.dependencies.vocabularyQuery.getVocabularyDetail(
      userId,
      vocabularyId,
    );
    if (!detail) {
      throw new NotFoundException({ code: 'VOCABULARY_NOT_FOUND' });
    }
    return parseLearnerPublicResponse(vocabularyDetailResponseSchema, {
      ...mapVocabularySummary(detail),
      relations: detail.relations,
      exampleSentences: detail.exampleSentences,
    });
  }

  /** 게시 어휘의 존재를 숨김 없이 확인한 뒤 관련 공개 문제를 반환한다 */
  async listRelatedQuestions(
    userId: string,
    vocabularyId: string,
    query: VocabularyRelatedQuestionsQuery,
  ): Promise<VocabularyRelatedQuestionsResponse> {
    const detail = await this.dependencies.vocabularyQuery.getVocabularyDetail(
      userId,
      vocabularyId,
    );
    if (!detail) {
      throw new NotFoundException({ code: 'VOCABULARY_NOT_FOUND' });
    }
    return parseLearnerPublicResponse(
      vocabularyRelatedQuestionsResponseSchema,
      await this.dependencies.vocabularyQuery.listRelatedQuestions(
        userId,
        vocabularyId,
        query,
      ),
    );
  }
}
