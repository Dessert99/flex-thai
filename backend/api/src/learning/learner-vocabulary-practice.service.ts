/** 단어 연습 내부 snapshot을 signed media와 strict 공개 응답으로 조립한다 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  vocabularyPracticeAnswerResponseSchema,
  vocabularyPracticeSessionResponseSchema,
  type CreateVocabularyPracticeRequest,
  type PracticeCard,
  type SubmitVocabularyPracticeAnswerRequest,
  type VocabularyPracticeAnswerResponse,
  type VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import type {
  MediaReadUrlProvider,
  PracticeCardSnapshot,
  PracticeSessionRecord,
  VocabularyPracticeService,
} from '@flex-thia/domain';
import type { ZodType } from 'zod';

const MEDIA_URL_TTL_MS = 5 * 60 * 1_000;
type SignMedia = (storageKey: string) => Promise<string>;

/** 단어 연습 내부 필드가 공개 계약과 어긋났음을 숨기는 오류 */
export class LearnerVocabularyPracticePublicResponseError extends Error {
  constructor() {
    super('LEARNER_VOCABULARY_PRACTICE_PUBLIC_RESPONSE_INVALID');
    this.name = 'LearnerVocabularyPracticePublicResponseError';
  }
}

/** 단어 연습 HTTP application service가 소비하는 최소 의존성 */
export interface LearnerVocabularyPracticeDependencies {
  practice: Pick<VocabularyPracticeService, 'answer' | 'create' | 'get'>;
  mediaReadUrls: MediaReadUrlProvider;
  now?: () => Date;
}

const parsePublicResponse = <Output>(
  schema: ZodType<Output>,
  value: unknown,
): Output => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new LearnerVocabularyPracticePublicResponseError();
  }
  return result.data;
};

const mapDomainError = (error: unknown): never => {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : null;
  if (
    code === 'PRACTICE_SOURCE_NOT_FOUND' ||
    code === 'PRACTICE_SESSION_NOT_FOUND'
  ) {
    throw new NotFoundException({ code });
  }
  if (code?.startsWith('PRACTICE_')) {
    throw new ConflictException({ code });
  }
  throw error;
};

const mapCard = async (
  card: PracticeCardSnapshot,
  signMedia: SignMedia,
): Promise<PracticeCard> => ({
  id: card.id,
  thai: card.thai,
  kind: card.kind,
  meanings: card.meanings,
  pronunciations: await Promise.all(
    card.pronunciations.map(async (pronunciation) => ({
      id: pronunciation.id,
      pronunciationKo: pronunciation.pronunciationKo,
      toneMarks: pronunciation.toneMarks,
      audioUrl: await signMedia(pronunciation.storageKey),
    })),
  ),
  meaningPronunciations: card.meaningPronunciations,
});

/** 단어 연습 use case를 진행 복구 가능한 공개 응답으로 제한한다 */
export class LearnerVocabularyPracticeService {
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: LearnerVocabularyPracticeDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** 요청한 source·방식·수를 materialize한 세션을 반환한다 */
  async create(
    userId: string,
    request: CreateVocabularyPracticeRequest,
  ): Promise<VocabularyPracticeSessionResponse> {
    try {
      return await this.mapSession(
        await this.dependencies.practice.create({ userId, ...request }),
      );
    } catch (error) {
      return mapDomainError(error);
    }
  }

  /** 사용자 세션과 답변 진행을 새 signed URL로 반환한다 */
  async get(
    userId: string,
    sessionId: string,
  ): Promise<VocabularyPracticeSessionResponse> {
    try {
      return await this.mapSession(
        await this.dependencies.practice.get(userId, sessionId),
      );
    } catch (error) {
      return mapDomainError(error);
    }
  }

  /** 답안을 제출하고 정답과 전체 카드를 즉시 반환한다 */
  async answer(
    userId: string,
    sessionId: string,
    questionId: string,
    request: SubmitVocabularyPracticeAnswerRequest,
  ): Promise<VocabularyPracticeAnswerResponse> {
    try {
      const feedback = await this.dependencies.practice.answer({
        userId,
        sessionId,
        questionId,
        ...request,
      });
      const signMedia = this.createResponseSigner();
      return parsePublicResponse(vocabularyPracticeAnswerResponseSchema, {
        questionId: feedback.answer.questionId,
        selectedOptionId: feedback.answer.selectedOptionId,
        selectedLabel: feedback.answer.selectedLabelSnapshot,
        isCorrect: feedback.answer.isCorrect,
        correctOptionId: feedback.correctOptionId,
        card: await mapCard(feedback.card, signMedia),
        sessionCompleted: feedback.sessionCompleted,
        answeredAt: feedback.answer.answeredAt.toISOString(),
      });
    } catch (error) {
      return mapDomainError(error);
    }
  }

  private async mapSession(
    session: PracticeSessionRecord,
  ): Promise<VocabularyPracticeSessionResponse> {
    const signMedia = this.createResponseSigner();
    const cardSnapshots = new Map(
      session.questions.map(({ card }) => [card.id, card]),
    );
    const cards = await Promise.all(
      [...cardSnapshots.values()].map((card) => mapCard(card, signMedia)),
    );
    const publicCards = new Map(cards.map((card) => [card.id, card]));
    const questions = await Promise.all(
      session.questions.map(async (question) => ({
        id: question.id,
        position: question.position,
        vocabularyId: question.vocabularyId,
        meaningId: question.meaningId,
        mode: question.mode,
        prompt:
          question.prompt.type === 'TEXT'
            ? question.prompt
            : {
                type: 'AUDIO' as const,
                audioUrl: await signMedia(question.prompt.storageKey),
              },
        options: question.options,
      })),
    );
    const base = {
      id: session.id,
      sourceLabel: session.sourceLabel,
      modes: session.modes,
      questionCount: session.questionCount,
      order: session.order,
      startedAt: session.startedAt.toISOString(),
      cards,
      questions,
      answeredQuestionIds: session.answers.map(({ questionId }) => questionId),
    };
    if (session.status === 'ACTIVE') {
      return parsePublicResponse(vocabularyPracticeSessionResponseSchema, {
        ...base,
        status: 'ACTIVE',
        completedAt: null,
      });
    }

    const answers = new Map(
      session.answers.map((answer) => [answer.questionId, answer]),
    );
    const total = session.answers.reduce(
      (count, answer) => ({
        correct: count.correct + Number(answer.isCorrect),
        incorrect: count.incorrect + Number(!answer.isCorrect),
      }),
      { correct: 0, incorrect: 0 },
    );
    const byMode = session.modes.map((mode) => {
      const modeAnswers = session.questions
        .filter((question) => question.mode === mode)
        .map(({ id }) => answers.get(id))
        .filter((answer) => answer !== undefined);
      return {
        mode,
        correct: modeAnswers.filter(({ isCorrect }) => isCorrect).length,
        incorrect: modeAnswers.filter(({ isCorrect }) => !isCorrect).length,
      };
    });
    const incorrectCards = [
      ...new Map(
        session.questions
          .filter((question) => answers.get(question.id)?.isCorrect === false)
          .map((question) => [
            question.card.id,
            publicCards.get(question.card.id),
          ]),
      ).values(),
    ].filter((card) => card !== undefined);

    return parsePublicResponse(vocabularyPracticeSessionResponseSchema, {
      ...base,
      status: 'COMPLETED',
      completedAt: session.completedAt?.toISOString(),
      result: { total, byMode, incorrectCards },
    });
  }

  private createResponseSigner(): SignMedia {
    const expiresAt = new Date(this.now().getTime() + MEDIA_URL_TTL_MS);
    const cache = new Map<string, Promise<string>>();
    return (storageKey) => {
      const cached = cache.get(storageKey);
      if (cached) return cached;
      const pending = this.dependencies.mediaReadUrls.createReadUrl(
        storageKey,
        expiresAt,
      );
      cache.set(storageKey, pending);
      return pending;
    };
  }
}
