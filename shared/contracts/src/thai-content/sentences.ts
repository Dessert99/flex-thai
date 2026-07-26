/** 문제와 어휘가 공유하는 태국어 문장 공개 계약을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.uuid();
const positionSchema = z.number().safe().nonnegative();
const positivePositionSchema = z.number().safe().positive();
const nullableAudioUrlSchema = z.string().url().nullable();

/** 단어의 문맥 학습 피드백 계약 */
export const thaiTokenFeedbackSchema = z
  .object({
    position: positionSchema,
    surface: z.string().min(1),
    startOffset: positionSchema,
    endOffset: positivePositionSchema,
    vocabularyId: uuidSchema,
    meaningId: uuidSchema,
    pronunciationId: uuidSchema,
    contextMeaningKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    audioUrl: nullableAudioUrlSchema,
    role: z.enum(['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION']),
  })
  .strict();

/** 표현 전체의 문맥 학습 피드백 계약 */
export const thaiExpressionFeedbackSchema = z
  .object({
    startTokenIndex: positionSchema,
    endTokenIndex: positivePositionSchema,
    vocabularyId: uuidSchema,
    meaningId: uuidSchema,
    pronunciationId: uuidSchema,
    contextMeaningKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    audioUrl: nullableAudioUrlSchema,
    representative: z.boolean(),
  })
  .strict();

/** 문제·해설·예문이 공유하는 공개 태국어 문장 계약 */
export const publicThaiSentenceSchema = z
  .object({
    sentenceVersionId: uuidSchema,
    originalText: z.string().min(1),
    translationKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    audioUrl: nullableAudioUrlSchema,
    tokens: z.array(thaiTokenFeedbackSchema),
    expressions: z.array(thaiExpressionFeedbackSchema),
  })
  .strict();

/** 직렬화 가능한 공개 태국어 문장 타입 */
export type PublicThaiSentence = z.infer<typeof publicThaiSentenceSchema>;

/** 직렬화 가능한 단어 피드백 타입 */
export type ThaiTokenFeedback = z.infer<typeof thaiTokenFeedbackSchema>;

/** 직렬화 가능한 표현 피드백 타입 */
export type ThaiExpressionFeedback = z.infer<typeof thaiExpressionFeedbackSchema>;
