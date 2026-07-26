/** 학습자 공용·저장 어휘와 관련 문제의 공개 JSON 계약을 정의한다 */
import { z } from 'zod';
import { pageMetadataSchema, questionListItemSchema } from './questions.js';

const uuidSchema = z.uuid();
const difficultySchema = z.number().safe().min(1).max(5);
const httpIntegerSchema = (minimum: number, maximum: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .transform((value) => Number(value)),
    ])
    .pipe(z.number().safe().min(minimum).max(maximum));

const pageQueryShape = {
  page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
  pageSize: httpIntegerSchema(1, 100).default(20),
};

const vocabularyMeaningSchema = z
  .object({
    id: uuidSchema,
    meaningKo: z.string().min(1),
    partOfSpeech: z.string().min(1),
    difficulty: difficultySchema.nullable(),
    contextNote: z.string().min(1).nullable(),
  })
  .strict();

const vocabularyPronunciationSchema = z
  .object({
    id: uuidSchema,
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    audioUrl: z.string().url(),
  })
  .strict();

const vocabularyMeaningPronunciationSchema = z
  .object({
    meaningId: uuidSchema,
    pronunciationId: uuidSchema,
  })
  .strict();

const vocabularySummaryShape = {
  id: uuidSchema,
  thai: z.string().min(1),
  kind: z.enum(['WORD', 'EXPRESSION']),
  meanings: z.array(vocabularyMeaningSchema),
  pronunciations: z.array(vocabularyPronunciationSchema),
  saved: z.boolean(),
};

const exampleSentenceSchema = z
  .object({
    sentenceVersionId: uuidSchema,
    originalText: z.string().min(1),
    translationKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    audioUrl: z.string().url(),
  })
  .strict();

/** 공용 어휘 검색의 표기·분류·난이도와 페이지 query */
export const vocabularyListQuerySchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    kind: z.enum(['WORD', 'EXPRESSION']).optional(),
    partOfSpeech: z.string().trim().min(1).optional(),
    difficulty: httpIntegerSchema(1, 5).optional(),
    ...pageQueryShape,
  })
  .strict();

/** 어휘 목록과 저장 목록이 공유하는 공개 뜻·발음 요약 */
export const vocabularySummarySchema = z
  .object(vocabularySummaryShape)
  .strict();

/** 게시 어휘 검색 결과의 페이지 응답 */
export const vocabularyListResponseSchema = z
  .object({
    items: z.array(vocabularySummarySchema),
    page: pageMetadataSchema,
  })
  .strict();

/** 공개 뜻·발음 음성과 현재 게시 문제의 예문을 포함한 어휘 상세 */
export const vocabularyDetailResponseSchema = z
  .object({
    ...vocabularySummaryShape,
    meaningPronunciations: z.array(vocabularyMeaningPronunciationSchema),
    exampleSentences: z.array(exampleSentenceSchema),
  })
  .strict()
  .superRefine((detail, context) => {
    const meaningIds = new Set(detail.meanings.map((meaning) => meaning.id));
    const pronunciationIds = new Set(
      detail.pronunciations.map((pronunciation) => pronunciation.id),
    );
    const pairs = new Set<string>();

    detail.meaningPronunciations.forEach((link, index) => {
      if (!meaningIds.has(link.meaningId)) {
        context.addIssue({
          code: 'custom',
          message: '상세에 존재하는 뜻만 연결할 수 있습니다.',
          path: ['meaningPronunciations', index, 'meaningId'],
        });
      }
      if (!pronunciationIds.has(link.pronunciationId)) {
        context.addIssue({
          code: 'custom',
          message: '상세에 존재하는 발음만 연결할 수 있습니다.',
          path: ['meaningPronunciations', index, 'pronunciationId'],
        });
      }

      const pair = `${link.meaningId}:${link.pronunciationId}`;
      if (pairs.has(pair)) {
        context.addIssue({
          code: 'custom',
          message: '같은 뜻과 발음 연결을 중복할 수 없습니다.',
          path: ['meaningPronunciations', index],
        });
      }
      pairs.add(pair);
    });
  });

/** 한 어휘를 참조하는 현재 게시 문제의 페이지 query */
export const vocabularyRelatedQuestionsQuerySchema = z
  .object(pageQueryShape)
  .strict();

/** 한 어휘를 참조하는 현재 게시 문제의 페이지 응답 */
export const vocabularyRelatedQuestionsResponseSchema = z
  .object({
    items: z.array(questionListItemSchema),
    page: pageMetadataSchema,
  })
  .strict();

/** 통합 전 기존 저장 어휘 목록의 페이지 query */
export const savedVocabularyListQuerySchema = z.object(pageQueryShape).strict();

/** 통합 전 기존 저장 어휘 목록의 페이지 응답 */
export const savedVocabularyListResponseSchema = z
  .object({
    items: z.array(vocabularySummarySchema),
    page: pageMetadataSchema,
  })
  .strict();

/** 어휘 상세·관련 문제·저장 경로의 UUID parameter */
export const vocabularyIdPathSchema = z
  .object({ vocabularyId: uuidSchema })
  .strict();

/** 검증된 공용 어휘 목록 query type */
export type VocabularyListQuery = z.infer<typeof vocabularyListQuerySchema>;

/** 직렬화 가능한 공개 어휘 요약 type */
export type VocabularySummary = z.infer<typeof vocabularySummarySchema>;

/** 직렬화 가능한 공용 어휘 목록 응답 type */
export type VocabularyListResponse = z.infer<
  typeof vocabularyListResponseSchema
>;

/** 직렬화 가능한 어휘 상세 응답 type */
export type VocabularyDetailResponse = z.infer<
  typeof vocabularyDetailResponseSchema
>;

/** 검증된 관련 문제 목록 query type */
export type VocabularyRelatedQuestionsQuery = z.infer<
  typeof vocabularyRelatedQuestionsQuerySchema
>;

/** 직렬화 가능한 관련 문제 목록 응답 type */
export type VocabularyRelatedQuestionsResponse = z.infer<
  typeof vocabularyRelatedQuestionsResponseSchema
>;

/** 통합 전 기존 저장 어휘 목록 query type */
export type SavedVocabularyListQuery = z.infer<
  typeof savedVocabularyListQuerySchema
>;

/** 통합 전 기존 저장 어휘 목록 응답 type */
export type SavedVocabularyListResponse = z.infer<
  typeof savedVocabularyListResponseSchema
>;

/** 검증된 어휘 UUID path type */
export type VocabularyIdPath = z.infer<typeof vocabularyIdPathSchema>;
