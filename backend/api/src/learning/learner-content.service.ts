/** 학습자 read/write 결과를 private key 없는 strict 공개 응답으로 조립한다 */
import { NotFoundException } from '@nestjs/common';
import {
  questionAttemptListResponseSchema,
  questionDetailResponseSchema,
  questionListResponseSchema,
  savedVocabularyListResponseSchema,
  submitQuestionAttemptResponseSchema,
  vocabularyDetailResponseSchema,
  vocabularyListResponseSchema,
  vocabularyRelatedQuestionsResponseSchema,
  type QuestionAttemptListQuery,
  type QuestionAttemptListResponse,
  type QuestionDetailResponse,
  type QuestionListQuery,
  type QuestionListResponse,
  type SavedVocabularyListQuery,
  type SavedVocabularyListResponse,
  type SubmitQuestionAttemptRequest,
  type SubmitQuestionAttemptResponse,
  type VocabularyDetailResponse,
  type VocabularyListQuery,
  type VocabularyListResponse,
  type VocabularyRelatedQuestionsQuery,
  type VocabularyRelatedQuestionsResponse,
} from '@flex-thia/contracts';
import {
  type DrizzleLearnerQuestionQuery,
  type DrizzleLearnerVocabularyQuery,
  type LearnerQuestionListQuery,
  type LearnerQuestionBlockProjection,
  type LearnerQuestionSentenceProjection,
  type LearnerVocabularyListQuery,
  type LearnerVocabularySummaryProjection,
} from '@flex-thia/database';
import {
  type MediaReadUrlProvider,
  type QuestionAttemptService,
  type SavedContentService,
} from '@flex-thia/domain';
import type { ZodType } from 'zod';

const MEDIA_URL_TTL_MS = 5 * 60 * 1_000;

type QuestionQuery = Pick<
  DrizzleLearnerQuestionQuery,
  'getExplanation' | 'getQuestionDetail' | 'listAttempts' | 'listQuestions'
>;

type VocabularyQuery = Pick<
  DrizzleLearnerVocabularyQuery,
  | 'getVocabularyDetail'
  | 'listRelatedQuestions'
  | 'listSavedVocabularies'
  | 'listVocabularies'
>;

type QuestionAttempts = Pick<QuestionAttemptService, 'submit'>;
type SavedContent = Pick<
  SavedContentService,
  'removeQuestion' | 'removeVocabulary' | 'saveQuestion' | 'saveVocabulary'
>;

interface LearnerContentDependencies {
  questionQuery: QuestionQuery;
  vocabularyQuery: VocabularyQuery;
  questionAttempts: QuestionAttempts;
  savedContent: SavedContent;
  mediaReadUrls: MediaReadUrlProvider;
  now?: () => Date;
}

type SignMedia = (storageKey: string) => Promise<string>;

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
  ...(query.questionTypeId === undefined
    ? {}
    : { questionTypeId: query.questionTypeId }),
  ...(query.difficulty === undefined ? {} : { difficulty: query.difficulty }),
  ...(query.saved === undefined ? {} : { saved: query.saved }),
  ...(query.firstResult === undefined
    ? {}
    : { firstResult: query.firstResult }),
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

const mapSentence = async (
  sentence: LearnerQuestionSentenceProjection,
  signMedia: SignMedia,
) => {
  const mapFeedback = async <
    Feedback extends {
      media: { storageKey: string } | null;
    },
  >(
    feedback: Feedback,
  ) => {
    const { media, ...publicFeedback } = feedback;
    return {
      ...publicFeedback,
      audioUrl: media ? await signMedia(media.storageKey) : null,
    };
  };

  return {
    sentenceVersionId: sentence.sentenceVersionId,
    originalText: sentence.originalText,
    translationKo: sentence.translationKo,
    pronunciationKo: sentence.pronunciationKo,
    toneMarks: sentence.toneMarks,
    audioUrl: await signMedia(sentence.media.storageKey),
    tokens: await Promise.all(sentence.tokens.map(mapFeedback)),
    expressions: await Promise.all(sentence.expressions.map(mapFeedback)),
  };
};

const mapBlocks = (
  blocks: LearnerQuestionBlockProjection[],
  signMedia: SignMedia,
) =>
  Promise.all(
    blocks.map(async (block) => ({
      id: block.id,
      kind: block.kind,
      displayMode: block.displayMode,
      position: block.position,
      sentences: await Promise.all(
        block.sentences.map(async (item) => ({
          position: item.position,
          speaker: item.speaker,
          sentence: await mapSentence(item.sentence, signMedia),
        })),
      ),
    })),
  );

const mapVocabularySummary = async (
  vocabulary: LearnerVocabularySummaryProjection,
  signMedia: SignMedia,
) => ({
  id: vocabulary.id,
  thai: vocabulary.thai,
  kind: vocabulary.kind,
  meanings: vocabulary.meanings,
  pronunciations: await Promise.all(
    vocabulary.pronunciations.map(async (pronunciation) => ({
      id: pronunciation.id,
      pronunciationKo: pronunciation.pronunciationKo,
      toneMarks: pronunciation.toneMarks,
      audioUrl: await signMedia(pronunciation.media.storageKey),
    })),
  ),
  saved: vocabulary.saved,
});

/** DB projection, 학습 use case와 media signer를 학습자 공개 응답으로 조정한다 */
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
    return parseLearnerPublicResponse(
      questionListResponseSchema,
      await this.dependencies.questionQuery.listQuestions(
        userId,
        toQuestionListQuery(query),
      ),
    );
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
    const signMedia = this.createResponseSigner();
    return parseLearnerPublicResponse(questionDetailResponseSchema, {
      ...detail,
      blocks: await mapBlocks(detail.blocks, signMedia),
      options: await Promise.all(
        detail.options.map(async (option) => ({
          id: option.id,
          position: option.position,
          sentence: await mapSentence(option.sentence, signMedia),
          ...(option.span === null ? {} : { span: option.span }),
        })),
      ),
    });
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
    const explanation = await this.dependencies.questionQuery.getExplanation(
      result.attempt.questionVersionId,
    );
    const signMedia = this.createResponseSigner();
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
        explanationBlocks: await mapBlocks(explanation, signMedia),
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
    const signMedia = this.createResponseSigner();
    return parseLearnerPublicResponse(vocabularyListResponseSchema, {
      ...result,
      items: await Promise.all(
        result.items.map((item) => mapVocabularySummary(item, signMedia)),
      ),
    });
  }

  /** 게시 어휘 상세의 발음과 예문 media만 5분 URL로 바꾼다 */
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
    const signMedia = this.createResponseSigner();
    return parseLearnerPublicResponse(vocabularyDetailResponseSchema, {
      ...(await mapVocabularySummary(detail, signMedia)),
      meaningPronunciations: detail.meaningPronunciations,
      exampleSentences: await Promise.all(
        detail.exampleSentences.map((example) =>
          mapSentence(example, signMedia),
        ),
      ),
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

  /** 현재 사용자가 저장한 게시 어휘의 private media를 URL로 바꾼다 */
  async listSavedVocabularies(
    userId: string,
    query: SavedVocabularyListQuery,
  ): Promise<SavedVocabularyListResponse> {
    const result =
      await this.dependencies.vocabularyQuery.listSavedVocabularies(
        userId,
        query,
      );
    const signMedia = this.createResponseSigner();
    return parseLearnerPublicResponse(savedVocabularyListResponseSchema, {
      ...result,
      items: await Promise.all(
        result.items.map((item) => mapVocabularySummary(item, signMedia)),
      ),
    });
  }

  /** 현재 게시 어휘를 현재 시각으로 멱등 저장한다 */
  saveVocabulary(userId: string, vocabularyId: string): Promise<void> {
    return this.dependencies.savedContent.saveVocabulary(
      userId,
      vocabularyId,
      this.now(),
    );
  }

  /** 어휘 공개 상태와 무관하게 저장 연결을 멱등 제거한다 */
  removeVocabulary(userId: string, vocabularyId: string): Promise<void> {
    return this.dependencies.savedContent.removeVocabulary(
      userId,
      vocabularyId,
    );
  }

  private createResponseSigner(): SignMedia {
    const expiresAt = new Date(this.now().getTime() + MEDIA_URL_TTL_MS);
    const cache = new Map<string, Promise<string>>();
    return (storageKey) => {
      const existing = cache.get(storageKey);
      if (existing) {
        return existing;
      }
      const pending = this.dependencies.mediaReadUrls.createReadUrl(
        storageKey,
        expiresAt,
      );
      cache.set(storageKey, pending);
      return pending;
    };
  }
}
