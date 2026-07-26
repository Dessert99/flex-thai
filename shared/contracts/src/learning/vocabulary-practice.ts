/** 단어 연습 생성·진행·답안·완료 결과의 공개 JSON 계약을 정의한다 */
import { z } from 'zod';
import { vocabularySummarySchema } from './vocabularies.js';

const practiceModeValues = [
  'THAI_TO_MEANING',
  'MEANING_TO_THAI',
  'AUDIO_TO_THAI',
  'AUDIO_TO_MEANING',
] as const;

const rejectDuplicates = (
  values: readonly string[],
  context: z.RefinementCtx,
) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: 'custom',
      message: '같은 값을 중복 선택할 수 없습니다.',
    });
  }
};

/** 단어 연습의 출제 방식 */
export const practiceModeSchema = z.enum(practiceModeValues);

const searchSelectionSourceSchema = z
  .object({
    type: z.literal('SEARCH_SELECTION'),
    vocabularyIds: z.array(z.uuid()).min(1).max(100),
  })
  .strict()
  .superRefine((source, context) => {
    rejectDuplicates(source.vocabularyIds, context);
  });

const wordbookSourceSchema = z
  .object({
    type: z.literal('WORDBOOK'),
    wordbookId: z.uuid(),
  })
  .strict();

/** 검색 선택과 사용자 단어장을 구분하는 연습 출처 */
export const practiceSourceSchema = z.discriminatedUnion('type', [
  searchSelectionSourceSchema,
  wordbookSourceSchema,
]);

/** 단어 연습 세션 생성 요청 */
export const createVocabularyPracticeRequestSchema = z
  .object({
    source: practiceSourceSchema,
    modes: z.array(practiceModeSchema).min(1).max(practiceModeValues.length),
    questionCount: z.union([z.literal(10), z.literal(20), z.literal('ALL')]),
    order: z.enum(['RANDOM', 'SOURCE']),
  })
  .strict()
  .superRefine((request, context) => {
    rejectDuplicates(request.modes, context);
  });

/** 단어 연습 답안 제출 요청 */
export const submitVocabularyPracticeAnswerRequestSchema = z
  .object({
    clientAnswerId: z.uuid(),
    selectedOptionId: z.uuid(),
  })
  .strict();

/** 단어 연습 세션 UUID path */
export const vocabularyPracticeSessionPathSchema = z
  .object({ sessionId: z.uuid() })
  .strict();

/** 단어 연습 세션과 문항 UUID path */
export const vocabularyPracticeQuestionPathSchema = z
  .object({
    sessionId: z.uuid(),
    questionId: z.uuid(),
  })
  .strict();

const meaningPronunciationSchema = z
  .object({
    meaningId: z.uuid(),
    pronunciationId: z.uuid(),
  })
  .strict();

/** 전체 뜻·발음·성조·뜻-발음 관계를 공개하는 단어 연습 카드 */
export const practiceCardSchema = z
  .object({
    ...vocabularySummarySchema.omit({
      audioEligibleMeaningCount: true,
      saved: true,
    }).shape,
    meanings: vocabularySummarySchema.shape.meanings.min(1),
    pronunciations: vocabularySummarySchema.shape.pronunciations.min(1),
    meaningPronunciations: z.array(meaningPronunciationSchema).min(1),
  })
  .strict()
  .superRefine((card, context) => {
    const meaningIds = new Set(card.meanings.map(({ id }) => id));
    const pronunciationIds = new Set(card.pronunciations.map(({ id }) => id));
    const pairs = new Set<string>();

    card.meaningPronunciations.forEach((link, index) => {
      if (!meaningIds.has(link.meaningId)) {
        context.addIssue({
          code: 'custom',
          message: '카드에 존재하는 뜻만 발음과 연결할 수 있습니다.',
          path: ['meaningPronunciations', index, 'meaningId'],
        });
      }
      if (!pronunciationIds.has(link.pronunciationId)) {
        context.addIssue({
          code: 'custom',
          message: '카드에 존재하는 발음만 뜻과 연결할 수 있습니다.',
          path: ['meaningPronunciations', index, 'pronunciationId'],
        });
      }
      const pair = `${link.meaningId}:${link.pronunciationId}`;
      if (pairs.has(pair)) {
        context.addIssue({
          code: 'custom',
          message: '같은 뜻과 발음 관계를 중복할 수 없습니다.',
          path: ['meaningPronunciations', index],
        });
      }
      pairs.add(pair);
    });
  });

const textPromptSchema = z
  .object({
    type: z.literal('TEXT'),
    text: z.string().min(1),
  })
  .strict();

const audioPromptSchema = z
  .object({
    type: z.literal('AUDIO'),
    audioUrl: z.url(),
  })
  .strict();

const practiceOptionSchema = z
  .object({
    id: z.uuid(),
    label: z.string().min(1),
  })
  .strict();

/** 정답을 제외한 materialized 단어 연습 문항 */
export const practiceQuestionSchema = z
  .object({
    id: z.uuid(),
    position: z.number().safe().int().positive(),
    vocabularyId: z.uuid(),
    meaningId: z.uuid(),
    mode: practiceModeSchema,
    prompt: z.discriminatedUnion('type', [textPromptSchema, audioPromptSchema]),
    options: z.array(practiceOptionSchema).length(4),
  })
  .strict()
  .superRefine((question, context) => {
    rejectDuplicates(
      question.options.map((option) => option.id),
      context,
    );
    rejectDuplicates(
      question.options.map((option) => option.label),
      context,
    );
  });

const practiceCountSchema = z
  .object({
    correct: z.number().safe().int().nonnegative(),
    incorrect: z.number().safe().int().nonnegative(),
  })
  .strict();

const practiceModeCountSchema = practiceCountSchema
  .extend({
    mode: practiceModeSchema,
  })
  .strict();

const practiceResultSchema = z
  .object({
    total: practiceCountSchema,
    byMode: z.array(practiceModeCountSchema),
    incorrectCards: z.array(practiceCardSchema),
  })
  .strict();

const vocabularyPracticeSessionShape = {
  id: z.uuid(),
  sourceLabel: z.string().min(1),
  modes: z.array(practiceModeSchema).min(1).max(practiceModeValues.length),
  questionCount: z.number().safe().int().min(1).max(100),
  order: z.enum(['RANDOM', 'SOURCE']),
  startedAt: z.iso.datetime(),
  cards: z.array(practiceCardSchema).min(1),
  questions: z.array(practiceQuestionSchema).min(1),
  answeredQuestionIds: z.array(z.uuid()),
};

/** 결과가 아직 공개되지 않은 진행 중 단어 연습 세션 */
export const activeVocabularyPracticeSessionSchema = z
  .object({
    ...vocabularyPracticeSessionShape,
    status: z.literal('ACTIVE'),
    completedAt: z.null(),
  })
  .strict();

/** 서버 집계를 포함하는 완료 단어 연습 세션 */
export const completedVocabularyPracticeSessionSchema = z
  .object({
    ...vocabularyPracticeSessionShape,
    status: z.literal('COMPLETED'),
    completedAt: z.iso.datetime(),
    result: practiceResultSchema,
  })
  .strict();

/** 진행 상태에 따라 결과 공개 여부를 강제하는 단어 연습 세션 응답 */
export const vocabularyPracticeSessionResponseSchema = z
  .discriminatedUnion('status', [
    activeVocabularyPracticeSessionSchema,
    completedVocabularyPracticeSessionSchema,
  ])
  .superRefine((session, context) => {
    const questionIds = new Set(session.questions.map(({ id }) => id));
    const answeredIds = new Set(session.answeredQuestionIds);
    if (answeredIds.size !== session.answeredQuestionIds.length) {
      context.addIssue({
        code: 'custom',
        message: '같은 문항의 답변 진행을 중복할 수 없습니다.',
        path: ['answeredQuestionIds'],
      });
    }
    session.answeredQuestionIds.forEach((questionId, index) => {
      if (!questionIds.has(questionId)) {
        context.addIssue({
          code: 'custom',
          message: '세션에 존재하는 문항만 답변 처리할 수 있습니다.',
          path: ['answeredQuestionIds', index],
        });
      }
    });
    if (
      session.status === 'COMPLETED' &&
      answeredIds.size !== questionIds.size
    ) {
      context.addIssue({
        code: 'custom',
        message: '완료 세션은 모든 문항에 답해야 합니다.',
        path: ['answeredQuestionIds'],
      });
    }
    if (session.status === 'COMPLETED') {
      const modeCounts = new Map(
        session.result.byMode.map((count) => [count.mode, count]),
      );
      const byModeTotal = session.result.byMode.reduce(
        (total, count) => ({
          correct: total.correct + count.correct,
          incorrect: total.incorrect + count.incorrect,
        }),
        { correct: 0, incorrect: 0 },
      );
      if (
        session.result.total.correct + session.result.total.incorrect !==
          session.questions.length ||
        byModeTotal.correct !== session.result.total.correct ||
        byModeTotal.incorrect !== session.result.total.incorrect ||
        modeCounts.size !== session.result.byMode.length ||
        modeCounts.size !== session.modes.length ||
        session.modes.some((mode) => !modeCounts.has(mode))
      ) {
        context.addIssue({
          code: 'custom',
          message: '완료 집계는 세션 문항과 방식별 집계에 일치해야 합니다.',
          path: ['result'],
        });
      }

      const cardIds = new Set(session.cards.map(({ id }) => id));
      const incorrectCardIds = new Set(
        session.result.incorrectCards.map(({ id }) => id),
      );
      const incorrectCardCount = session.result.incorrectCards.length;
      if (
        incorrectCardIds.size !== incorrectCardCount ||
        session.result.incorrectCards.some(({ id }) => !cardIds.has(id)) ||
        (session.result.total.incorrect === 0 && incorrectCardCount !== 0) ||
        (session.result.total.incorrect > 0 &&
          (incorrectCardCount === 0 ||
            incorrectCardCount > session.result.total.incorrect))
      ) {
        context.addIssue({
          code: 'custom',
          message: '오답 카드는 세션의 오답 집계와 일치해야 합니다.',
          path: ['result', 'incorrectCards'],
        });
      }
    }
  });

/** 한 문항 제출 직후 공개하는 정답 여부와 전체 학습 카드 */
export const vocabularyPracticeAnswerResponseSchema = z
  .object({
    questionId: z.uuid(),
    selectedOptionId: z.uuid(),
    selectedLabel: z.string().min(1),
    isCorrect: z.boolean(),
    correctOptionId: z.uuid(),
    card: practiceCardSchema,
    sessionCompleted: z.boolean(),
    answeredAt: z.iso.datetime(),
  })
  .strict();

/** 단어 연습 출제 방식 type */
export type PracticeMode = z.infer<typeof practiceModeSchema>;

/** 단어 연습 출처 type */
export type PracticeSource = z.infer<typeof practiceSourceSchema>;

/** 검증된 단어 연습 세션 생성 요청 type */
export type CreateVocabularyPracticeRequest = z.infer<
  typeof createVocabularyPracticeRequestSchema
>;

/** 검증된 단어 연습 답안 제출 요청 type */
export type SubmitVocabularyPracticeAnswerRequest = z.infer<
  typeof submitVocabularyPracticeAnswerRequestSchema
>;

/** 직렬화 가능한 단어 연습 카드 type */
export type PracticeCard = z.infer<typeof practiceCardSchema>;

/** 정답이 제거된 단어 연습 문항 type */
export type PracticeQuestion = z.infer<typeof practiceQuestionSchema>;

/** 직렬화 가능한 단어 연습 세션 응답 type */
export type VocabularyPracticeSessionResponse = z.infer<
  typeof vocabularyPracticeSessionResponseSchema
>;

/** 직렬화 가능한 단어 연습 답 피드백 type */
export type VocabularyPracticeAnswerResponse = z.infer<
  typeof vocabularyPracticeAnswerResponseSchema
>;
