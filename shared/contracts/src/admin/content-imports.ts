/** 관리자 콘텐츠 가져오기의 canonical 입력과 공개 결과 계약을 정의한다 */
import { z } from 'zod';
import { pageMetadataSchema } from '../learning/questions.js';

const uuidSchema = z.uuid();
const positiveIntegerSchema = z.number().int().safe().positive();
const nonnegativeIntegerSchema = z.number().int().safe().nonnegative();
const difficultySchema = z.number().int().safe().min(1).max(5);
const clientRefSchema = z.string().min(1);
const utcDateTimeSchema = z.string().datetime();

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

const pageQueryShape = {
  page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
  pageSize: httpIntegerSchema(1, 100).default(20),
};

const hasDuplicates = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

/** 기존 UUID 또는 같은 요청의 clientRef 중 하나로만 대상을 가리킨다 */
export const refSchema = z.union([
  z.object({ id: uuidSchema }).strict(),
  z.object({ clientRef: clientRefSchema }).strict(),
]);

const canonicalTokenInputSchema = z
  .object({
    surface: z.string().min(1),
    startOffset: nonnegativeIntegerSchema,
    endOffset: positiveIntegerSchema,
    vocabulary: refSchema,
    meaning: refSchema,
    pronunciation: refSchema,
    contextMeaningKo: z.string().min(1),
    role: z.enum(['TARGET', 'REQUIRED', 'SUPPORTING']),
  })
  .strict();

const canonicalExpressionInputSchema = z
  .object({
    startTokenIndex: nonnegativeIntegerSchema,
    endTokenIndex: positiveIntegerSchema,
    vocabulary: refSchema,
    representative: z.boolean().optional(),
  })
  .strict();

/** 가져오기와 관리자 문제 교체가 공유하는 태국어 문장 입력 */
export const canonicalSentenceInputSchema = z
  .object({
    originalText: z.string().min(1),
    translationKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    mediaAssetId: uuidSchema,
    tokens: z.array(canonicalTokenInputSchema),
    expressions: z.array(canonicalExpressionInputSchema),
  })
  .strict()
  .superRefine((sentence, context) => {
    const codePoints = Array.from(sentence.originalText);
    let previousEnd = 0;

    sentence.tokens.forEach((token, index) => {
      if (
        token.endOffset <= token.startOffset ||
        token.endOffset > codePoints.length
      ) {
        context.addIssue({
          code: 'custom',
          message: 'token offset 범위가 원문 안에 있어야 합니다.',
          path: ['tokens', index],
        });
        return;
      }
      if (token.startOffset < previousEnd) {
        context.addIssue({
          code: 'custom',
          message: 'token offset 범위는 겹칠 수 없습니다.',
          path: ['tokens', index],
        });
      }
      if (
        codePoints.slice(token.startOffset, token.endOffset).join('') !==
        token.surface
      ) {
        context.addIssue({
          code: 'custom',
          message: 'token surface는 원문 offset과 일치해야 합니다.',
          path: ['tokens', index, 'surface'],
        });
      }
      previousEnd = Math.max(previousEnd, token.endOffset);
    });

    sentence.expressions.forEach((expression, index) => {
      if (
        expression.endTokenIndex - expression.startTokenIndex < 2 ||
        expression.endTokenIndex > sentence.tokens.length
      ) {
        context.addIssue({
          code: 'custom',
          message: 'expression 범위는 문장 token 두 개 이상이어야 합니다.',
          path: ['expressions', index],
        });
      }
    });
  });

const vocabularyMeaningInputSchema = z
  .object({
    clientRef: clientRefSchema,
    meaningKo: z.string().min(1),
    partOfSpeech: z.string().min(1),
    difficulty: difficultySchema.nullable().optional(),
    contextNote: z.string().min(1).nullable().optional(),
  })
  .strict();

const vocabularyPronunciationInputSchema = z
  .object({
    clientRef: clientRefSchema,
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    mediaAssetId: uuidSchema,
  })
  .strict();

/** 한 가져오기 항목에서 생성할 어휘 초안 전체 입력 */
export const canonicalVocabularyInputSchema = z
  .object({
    clientRef: clientRefSchema,
    thai: z.string().min(1),
    kind: z.enum(['WORD', 'EXPRESSION']),
    meanings: z.array(vocabularyMeaningInputSchema).min(1),
    pronunciations: z.array(vocabularyPronunciationInputSchema).min(1),
  })
  .strict()
  .superRefine((vocabulary, context) => {
    const childRefs = [
      ...vocabulary.meanings.map(({ clientRef }) => clientRef),
      ...vocabulary.pronunciations.map(({ clientRef }) => clientRef),
    ];
    if (hasDuplicates(childRefs)) {
      context.addIssue({
        code: 'custom',
        message: '어휘 하위 clientRef는 중복될 수 없습니다.',
        path: ['meanings'],
      });
    }
  });

const questionBlockInputSchema = z
  .object({
    kind: z.enum([
      'INSTRUCTION',
      'PASSAGE',
      'DIALOGUE',
      'QUESTION',
      'EXPLANATION',
    ]),
    displayMode: z.enum([
      'TEXT',
      'AUDIO',
      'TEXT_AND_AUDIO',
      'AUDIO_THEN_REVEAL',
    ]),
    sentences: z
      .array(
        z
          .object({
            speaker: z.string().min(1).nullable().optional(),
            sentence: canonicalSentenceInputSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const questionOptionInputSchema = z
  .object({
    clientRef: clientRefSchema,
    position: nonnegativeIntegerSchema,
    sentence: canonicalSentenceInputSchema,
  })
  .strict();

const canonicalQuestionVersionShape = {
  questionTypeSlug: z.string().min(1),
  questionTypeVersion: positiveIntegerSchema,
  difficulty: difficultySchema,
  blocks: z.array(questionBlockInputSchema).min(1),
  options: z.array(questionOptionInputSchema).min(1),
  correctOptionRef: clientRefSchema,
};

const validateQuestionOptionRefs = (
  question: {
    options: Array<{ clientRef: string; position: number }>;
    correctOptionRef: string;
  },
  context: z.RefinementCtx,
): void => {
  const optionRefs = question.options.map(({ clientRef }) => clientRef);
  if (hasDuplicates(optionRefs)) {
    context.addIssue({
      code: 'custom',
      message: '선택지 clientRef는 중복될 수 없습니다.',
      path: ['options'],
    });
  }
  question.options.forEach((option, index) => {
    if (option.position !== index) {
      context.addIssue({
        code: 'custom',
        message: '선택지 position은 배열 순서와 일치해야 합니다.',
        path: ['options', index, 'position'],
      });
    }
  });
  if (!optionRefs.includes(question.correctOptionRef)) {
    context.addIssue({
      code: 'custom',
      message: 'correctOptionRef는 요청 안의 선택지를 가리켜야 합니다.',
      path: ['correctOptionRef'],
    });
  }
};

/** 초안 전체 교체와 가져오기가 공유하는 문제 버전 입력 */
export const canonicalQuestionVersionInputSchema = z
  .object(canonicalQuestionVersionShape)
  .strict()
  .superRefine(validateQuestionOptionRefs);

/** 한 가져오기 항목에서 생성할 문제 초안 전체 입력 */
export const canonicalQuestionInputSchema = z
  .object({
    clientRef: clientRefSchema,
    ...canonicalQuestionVersionShape,
  })
  .strict()
  .superRefine(validateQuestionOptionRefs);

/** schemaVersion 1과 합계 1~100개 항목을 강제하는 canonical import 요청 */
export const contentImportRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    vocabularies: z.array(canonicalVocabularyInputSchema).max(100),
    questions: z.array(canonicalQuestionInputSchema).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const total = request.vocabularies.length + request.questions.length;
    if (total < 1 || total > 100) {
      context.addIssue({
        code: 'custom',
        message: '가져오기 항목 합계는 1개에서 100개여야 합니다.',
        path: [],
      });
    }
    const itemRefs = [
      ...request.vocabularies.map(({ clientRef }) => clientRef),
      ...request.questions.map(({ clientRef }) => clientRef),
    ];
    if (hasDuplicates(itemRefs)) {
      context.addIssue({
        code: 'custom',
        message: '가져오기 항목 clientRef는 중복될 수 없습니다.',
        path: [],
      });
    }
  });

/** POST 가져오기 재전송을 식별하는 UUID header */
export const idempotencyKeyHeaderSchema = z
  .object({ 'idempotency-key': uuidSchema })
  .strict();

/** 가져오기 상세 경로의 UUID parameter */
export const contentImportIdPathSchema = z
  .object({ importId: uuidSchema })
  .strict();

/** 가져오기 이력의 페이지 query */
export const contentImportListQuerySchema = z.object(pageQueryShape).strict();

const contentImportSummaryShape = {
  id: uuidSchema,
  status: z.enum(['COMPLETED', 'COMPLETED_WITH_FAILURES']),
  vocabularyCount: nonnegativeIntegerSchema,
  questionCount: nonnegativeIntegerSchema,
  importedCount: nonnegativeIntegerSchema,
  rejectedCount: nonnegativeIntegerSchema,
  createdAt: utcDateTimeSchema,
  completedAt: utcDateTimeSchema,
};

const validateContentImportSummary = (
  summary: {
    status: 'COMPLETED' | 'COMPLETED_WITH_FAILURES';
    vocabularyCount: number;
    questionCount: number;
    importedCount: number;
    rejectedCount: number;
  },
  context: z.RefinementCtx,
): void => {
  const total = summary.vocabularyCount + summary.questionCount;
  if (total < 1 || total > 100) {
    context.addIssue({
      code: 'custom',
      message: '공개 가져오기 항목 합계는 1개에서 100개여야 합니다.',
      path: ['vocabularyCount'],
    });
  }
  if (summary.importedCount + summary.rejectedCount !== total) {
    context.addIssue({
      code: 'custom',
      message: '처리 결과 합계는 가져오기 항목 합계와 일치해야 합니다.',
      path: ['importedCount'],
    });
  }
  if (
    (summary.status === 'COMPLETED' && summary.rejectedCount !== 0) ||
    (summary.status === 'COMPLETED_WITH_FAILURES' &&
      summary.rejectedCount === 0)
  ) {
    context.addIssue({
      code: 'custom',
      message: '최종 상태는 거절 항목 존재 여부와 일치해야 합니다.',
      path: ['status'],
    });
  }
};

/** 가져오기 이력과 동기 처리 결과가 공유하는 공개 요약 */
export const contentImportSummarySchema = z
  .object(contentImportSummaryShape)
  .strict()
  .superRefine(validateContentImportSummary);

const importedItemResultSchema = z
  .object({
    kind: z.enum(['VOCABULARY', 'QUESTION']),
    sourceIndex: nonnegativeIntegerSchema,
    status: z.literal('IMPORTED'),
    targetId: uuidSchema,
    errors: z.tuple([]),
  })
  .strict();

const rejectedItemResultSchema = z
  .object({
    kind: z.enum(['VOCABULARY', 'QUESTION']),
    sourceIndex: nonnegativeIntegerSchema,
    status: z.literal('REJECTED'),
    targetId: z.null(),
    errors: z
      .array(
        z
          .object({
            path: z.string(),
            code: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** 원본 순서와 안정 오류만 공개하는 가져오기 항목 결과 */
export const contentImportItemResultSchema = z.discriminatedUnion('status', [
  importedItemResultSchema,
  rejectedItemResultSchema,
]);

/** 항목별 독립 성공·실패를 포함한 가져오기 상세 응답 */
export const contentImportDetailResponseSchema = z
  .object({
    ...contentImportSummaryShape,
    items: z.array(contentImportItemResultSchema),
  })
  .strict()
  .superRefine((detail, context) => {
    validateContentImportSummary(detail, context);

    const expectedTotal = detail.vocabularyCount + detail.questionCount;
    if (detail.items.length !== expectedTotal) {
      context.addIssue({
        code: 'custom',
        message: '공개 상세 항목 수는 가져오기 항목 합계와 일치해야 합니다.',
        path: ['items'],
      });
    }

    const importedCount = detail.items.filter(
      ({ status }) => status === 'IMPORTED',
    ).length;
    const rejectedCount = detail.items.length - importedCount;
    if (
      importedCount !== detail.importedCount ||
      rejectedCount !== detail.rejectedCount
    ) {
      context.addIssue({
        code: 'custom',
        message: '공개 상세 항목 상태 수는 처리 결과 count와 일치해야 합니다.',
        path: ['items'],
      });
    }

    (
      [
        ['VOCABULARY', detail.vocabularyCount],
        ['QUESTION', detail.questionCount],
      ] as const
    ).forEach(([kind, expectedCount]) => {
      const sourceIndexes = detail.items
        .filter((item) => item.kind === kind)
        .map(({ sourceIndex }) => sourceIndex);
      const sourceIndexSet = new Set(sourceIndexes);
      const coversExpectedRange =
        sourceIndexes.length === expectedCount &&
        sourceIndexSet.size === expectedCount &&
        Array.from(
          { length: expectedCount },
          (_, sourceIndex) => sourceIndex,
        ).every((sourceIndex) => sourceIndexSet.has(sourceIndex));
      if (!coversExpectedRange) {
        context.addIssue({
          code: 'custom',
          message:
            'kind별 sourceIndex는 원본 범위를 중복 없이 포함해야 합니다.',
          path: ['items'],
        });
      }
    });
  });

/** 전체 관리자 가져오기 이력의 페이지 응답 */
export const contentImportListResponseSchema = z
  .object({
    items: z.array(contentImportSummarySchema),
    page: pageMetadataSchema,
  })
  .strict();

/** 기존 ID 또는 같은 요청 참조 type */
export type ContentReference = z.infer<typeof refSchema>;

/** canonical 태국어 문장 입력 type */
export type CanonicalSentenceInput = z.infer<
  typeof canonicalSentenceInputSchema
>;

/** canonical 어휘 가져오기 항목 type */
export type CanonicalVocabularyInput = z.infer<
  typeof canonicalVocabularyInputSchema
>;

/** canonical 문제 버전 입력 type */
export type CanonicalQuestionVersionInput = z.infer<
  typeof canonicalQuestionVersionInputSchema
>;

/** canonical 문제 가져오기 항목 type */
export type CanonicalQuestionInput = z.infer<
  typeof canonicalQuestionInputSchema
>;

/** 검증된 콘텐츠 가져오기 요청 type */
export type ContentImportRequest = z.infer<typeof contentImportRequestSchema>;

/** 검증된 UUID Idempotency-Key header type */
export type ContentImportIdempotencyKeyHeader = z.infer<
  typeof idempotencyKeyHeaderSchema
>;

/** 검증된 가져오기 UUID path type */
export type ContentImportIdPath = z.infer<typeof contentImportIdPathSchema>;

/** 검증된 가져오기 페이지 query type */
export type ContentImportListQuery = z.infer<
  typeof contentImportListQuerySchema
>;

/** 공개 콘텐츠 가져오기 이력 요약 type */
export type ContentImportSummary = z.infer<typeof contentImportSummarySchema>;

/** 공개 콘텐츠 가져오기 항목 결과 type */
export type ContentImportItemResult = z.infer<
  typeof contentImportItemResultSchema
>;

/** 공개 콘텐츠 가져오기 상세 응답 type */
export type ContentImportDetailResponse = z.infer<
  typeof contentImportDetailResponseSchema
>;

/** 공개 콘텐츠 가져오기 이력 응답 type */
export type ContentImportListResponse = z.infer<
  typeof contentImportListResponseSchema
>;
