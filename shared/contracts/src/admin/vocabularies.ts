/** 관리자 어휘의 모든 상태 조회와 참조 보존 전체 교체 계약을 정의한다 */
import { z } from 'zod';
import { pageMetadataSchema } from '../learning/questions.js';

const uuidSchema = z.uuid();
const utcDateTimeSchema = z.string().datetime();
const difficultySchema = z.number().int().safe().min(1).max(5);
const vocabularyKindSchema = z.enum(['WORD', 'EXPRESSION']);
const vocabularyStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);
const mediaStatusSchema = z.enum(['UPLOADING', 'READY', 'REJECTED']);

const httpIntegerSchema = (minimum: number, maximum: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .transform((value) => Number(value)),
    ])
    .pipe(z.number().int().safe().min(minimum).max(maximum));

const hasDuplicates = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

/** 모든 어휘 상태와 표기를 검색하는 관리자 페이지 query */
export const adminVocabularyListQuerySchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    kind: vocabularyKindSchema.optional(),
    status: vocabularyStatusSchema.optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict();

/** 어휘 상세·교체·게시·숨김·복구 경로의 UUID parameter */
export const adminVocabularyIdPathSchema = z
  .object({ vocabularyId: uuidSchema })
  .strict();

const adminVocabularyMeaningInputSchema = z
  .object({
    clientRef: z.string().min(1),
    meaningKo: z.string().min(1),
    partOfSpeech: z.string().min(1),
    difficulty: difficultySchema.nullable().optional(),
    contextNote: z.string().min(1).nullable().optional(),
  })
  .strict();

const adminVocabularyPronunciationInputSchema = z
  .object({
    clientRef: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    mediaAssetId: uuidSchema,
  })
  .strict();

const adminVocabularyMeaningPronunciationInputSchema = z
  .object({
    meaningRef: z.string().min(1),
    pronunciationRef: z.string().min(1),
  })
  .strict();

/** 미사용 DRAFT 어휘와 하위 뜻·발음·mapping 전체 교체 요청 */
export const adminVocabularyReplaceRequestSchema = z
  .object({
    thai: z.string().min(1),
    kind: vocabularyKindSchema,
    meanings: z.array(adminVocabularyMeaningInputSchema).min(1),
    pronunciations: z.array(adminVocabularyPronunciationInputSchema).min(1),
    meaningPronunciations: z
      .array(adminVocabularyMeaningPronunciationInputSchema)
      .min(1),
  })
  .strict()
  .superRefine((vocabulary, context) => {
    const meaningRefs = vocabulary.meanings.map(({ clientRef }) => clientRef);
    const pronunciationRefs = vocabulary.pronunciations.map(
      ({ clientRef }) => clientRef,
    );
    if (hasDuplicates([...meaningRefs, ...pronunciationRefs])) {
      context.addIssue({
        code: 'custom',
        message: '어휘 하위 clientRef는 중복될 수 없습니다.',
        path: ['meanings'],
      });
    }

    const mappingKeys: string[] = [];
    vocabulary.meaningPronunciations.forEach((mapping, index) => {
      if (!meaningRefs.includes(mapping.meaningRef)) {
        context.addIssue({
          code: 'custom',
          message: 'mapping은 요청 안의 뜻을 가리켜야 합니다.',
          path: ['meaningPronunciations', index, 'meaningRef'],
        });
      }
      if (!pronunciationRefs.includes(mapping.pronunciationRef)) {
        context.addIssue({
          code: 'custom',
          message: 'mapping은 요청 안의 발음을 가리켜야 합니다.',
          path: ['meaningPronunciations', index, 'pronunciationRef'],
        });
      }
      mappingKeys.push(`${mapping.meaningRef}:${mapping.pronunciationRef}`);
    });
    if (hasDuplicates(mappingKeys)) {
      context.addIssue({
        code: 'custom',
        message: '뜻과 발음 mapping은 중복될 수 없습니다.',
        path: ['meaningPronunciations'],
      });
    }
  });

const adminVocabularyListItemSchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    kind: vocabularyKindSchema,
    status: vocabularyStatusSchema,
    meaningCount: z.number().int().safe().nonnegative(),
    pronunciationCount: z.number().int().safe().nonnegative(),
    updatedAt: utcDateTimeSchema,
  })
  .strict();

/** 모든 상태의 관리자 어휘 목록 페이지 응답 */
export const adminVocabularyListResponseSchema = z
  .object({
    items: z.array(adminVocabularyListItemSchema),
    page: pageMetadataSchema,
  })
  .strict();

const adminVocabularyMeaningSchema = z
  .object({
    id: uuidSchema,
    meaningKo: z.string().min(1),
    partOfSpeech: z.string().min(1),
    difficulty: difficultySchema.nullable(),
    contextNote: z.string().min(1).nullable(),
  })
  .strict();

const adminVocabularyPronunciationSchema = z
  .object({
    id: uuidSchema,
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    mediaAssetId: uuidSchema,
    mediaStatus: mediaStatusSchema,
  })
  .strict();

const adminVocabularyMeaningPronunciationSchema = z
  .object({
    meaningId: uuidSchema,
    pronunciationId: uuidSchema,
  })
  .strict();

/** 뜻·발음 mapping과 문장·문제 버전 사용처를 반환하는 관리자 상세 */
export const adminVocabularyDetailResponseSchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    kind: vocabularyKindSchema,
    status: vocabularyStatusSchema,
    meanings: z.array(adminVocabularyMeaningSchema),
    pronunciations: z.array(adminVocabularyPronunciationSchema),
    meaningPronunciations: z.array(adminVocabularyMeaningPronunciationSchema),
    usage: z
      .object({
        sentenceVersionIds: z.array(uuidSchema),
        questionVersionIds: z.array(uuidSchema),
      })
      .strict(),
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  })
  .strict();

/** 검증된 관리자 어휘 목록 query type */
export type AdminVocabularyListQuery = z.infer<
  typeof adminVocabularyListQuerySchema
>;

/** 관리자 어휘 전체 교체 요청 type */
export type AdminVocabularyReplaceRequest = z.infer<
  typeof adminVocabularyReplaceRequestSchema
>;

/** 관리자 어휘 목록 응답 type */
export type AdminVocabularyListResponse = z.infer<
  typeof adminVocabularyListResponseSchema
>;

/** 관리자 어휘 상세 응답 type */
export type AdminVocabularyDetailResponse = z.infer<
  typeof adminVocabularyDetailResponseSchema
>;
