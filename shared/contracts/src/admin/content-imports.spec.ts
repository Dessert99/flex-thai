/** 관리자 콘텐츠 가져오기 요청과 공개 결과 계약을 검증한다 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ContentImportIdPath,
  ContentImportIdempotencyKeyHeader,
  ContentImportItemResult,
  ContentImportSummary,
} from './content-imports.js';
import {
  canonicalSentenceInputSchema,
  contentImportDetailResponseSchema,
  contentImportIdPathSchema,
  contentImportListQuerySchema,
  contentImportRequestSchema,
  contentImportSummarySchema,
  idempotencyKeyHeaderSchema,
  refSchema,
} from './content-imports.js';

const ids = {
  import: '00000000-0000-4000-8000-000000000001',
  media: '00000000-0000-4000-8000-000000000002',
  target: '00000000-0000-4000-8000-000000000003',
} as const;

const vocabulary = {
  clientRef: 'vocabulary.greeting',
  thai: 'สวัสดี',
  kind: 'WORD',
  meanings: [
    {
      clientRef: 'meaning.greeting',
      meaningKo: '안녕하세요',
      partOfSpeech: '감탄사',
    },
  ],
  pronunciations: [
    {
      clientRef: 'pronunciation.greeting',
      pronunciationKo: '싸왓디',
      toneMarks: 'L-L-M',
      mediaAssetId: ids.media,
    },
  ],
} as const;

const sentence = {
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  mediaAssetId: ids.media,
  tokens: [
    {
      surface: 'สวัสดี',
      startOffset: 0,
      endOffset: 6,
      vocabulary: { clientRef: vocabulary.clientRef },
      meaning: { clientRef: vocabulary.meanings[0].clientRef },
      pronunciation: { clientRef: vocabulary.pronunciations[0].clientRef },
      contextMeaningKo: '안녕하세요',
      role: 'TARGET',
    },
  ],
  expressions: [],
} as const;

const question = {
  clientRef: 'question.greeting',
  questionTypeSlug: 'reading-standard-choice',
  questionTypeVersion: 1,
  difficulty: 1,
  blocks: [
    {
      kind: 'QUESTION',
      displayMode: 'TEXT',
      sentences: [{ speaker: null, sentence }],
    },
  ],
  options: [
    { clientRef: 'option.correct', position: 0, sentence, span: null },
    { clientRef: 'option.wrong', position: 1, sentence, span: null },
  ],
  correctOptionRef: 'option.correct',
} as const;

const request = {
  schemaVersion: 1,
  vocabularies: [vocabulary],
  questions: [question],
} as const;

describe('관리자 콘텐츠 가져오기 canonical 요청 계약', () => {
  it('schemaVersion 1의 strict 최소 어휘와 문제 payload를 허용한다', () => {
    expect(contentImportRequestSchema.parse(request)).toEqual({
      ...request,
      questions: request.questions.map((question) => ({
        ...question,
        topicSlug: 'general',
        tagSlugs: [],
      })),
    });
    expect(() =>
      contentImportRequestSchema.parse({ ...request, schemaVersion: 2 }),
    ).toThrow();
    expect(() =>
      contentImportRequestSchema.parse({ ...request, rawJson: '{}' }),
    ).toThrow();
  });

  it('inline option은 독립 문장 없이 block 문장 좌표만 허용한다', () => {
    const inlineQuestion = {
      ...question,
      questionTypeSlug: 'reading-inline-choice',
      options: question.options.map((option, position) => ({
        clientRef: option.clientRef,
        position,
        sentence: null,
        span: {
          blockPosition: 0,
          sentencePosition: 0,
          startTokenIndex: 0,
          endTokenIndex: 1,
        },
      })),
    };

    expect(
      contentImportRequestSchema.parse({
        ...request,
        questions: [inlineQuestion],
      }).questions[0]?.options[0]?.sentence,
    ).toBeNull();
    expect(() =>
      contentImportRequestSchema.parse({
        ...request,
        questions: [
          {
            ...inlineQuestion,
            options: [
              {
                ...inlineQuestion.options[0],
                sentence,
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('참조는 UUID id와 clientRef 중 정확히 하나만 허용한다', () => {
    expect(refSchema.parse({ id: ids.target })).toEqual({ id: ids.target });
    expect(refSchema.parse({ clientRef: 'vocabulary.greeting' })).toEqual({
      clientRef: 'vocabulary.greeting',
    });
    expect(() => refSchema.parse({})).toThrow();
    expect(() =>
      refSchema.parse({ id: ids.target, clientRef: 'vocabulary.greeting' }),
    ).toThrow();
  });

  it('문장 token offset과 expression token range를 검증한다', () => {
    expect(canonicalSentenceInputSchema.parse(sentence)).toEqual(sentence);
    expect(() =>
      canonicalSentenceInputSchema.parse({
        ...sentence,
        tokens: [{ ...sentence.tokens[0], endOffset: 0 }],
      }),
    ).toThrow();
    expect(() =>
      canonicalSentenceInputSchema.parse({
        ...sentence,
        expressions: [
          {
            startTokenIndex: 0,
            endTokenIndex: 0,
            vocabulary: { clientRef: vocabulary.clientRef },
          },
        ],
      }),
    ).toThrow();
  });

  it('표현의 뜻과 발음 및 문맥상 뜻 참조를 요구한다', () => {
    const expressionSentence = {
      ...sentence,
      originalText: 'สวัสดีครับ',
      tokens: [
        { ...sentence.tokens[0], endOffset: 6 },
        {
          ...sentence.tokens[0],
          surface: 'ครับ',
          startOffset: 6,
          endOffset: 10,
        },
      ],
      expressions: [
        {
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabulary: { clientRef: 'expression.greeting' },
          meaning: { clientRef: 'expression.meaning' },
          pronunciation: { clientRef: 'expression.pronunciation' },
          contextMeaningKo: '안녕하세요',
        },
      ],
    };

    expect(canonicalSentenceInputSchema.parse(expressionSentence)).toEqual(
      expressionSentence,
    );
  });

  it('선택지 순서·clientRef와 correctOptionRef 관계를 검증한다', () => {
    expect(() =>
      contentImportRequestSchema.parse({
        ...request,
        questions: [
          {
            ...question,
            options: [
              question.options[0],
              { ...question.options[1], position: 2 },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      contentImportRequestSchema.parse({
        ...request,
        questions: [
          {
            ...question,
            options: [
              question.options[0],
              { ...question.options[1], clientRef: 'option.correct' },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      contentImportRequestSchema.parse({
        ...request,
        questions: [{ ...question, correctOptionRef: 'option.missing' }],
      }),
    ).toThrow();
  });

  it('같은 종류의 항목 clientRef 중복을 거부한다', () => {
    expect(() =>
      contentImportRequestSchema.parse({
        ...request,
        vocabularies: [vocabulary, vocabulary],
        questions: [],
      }),
    ).toThrow();
    expect(() =>
      contentImportRequestSchema.parse({
        ...request,
        vocabularies: [
          {
            ...vocabulary,
            meanings: [vocabulary.meanings[0], vocabulary.meanings[0]],
          },
        ],
        questions: [],
      }),
    ).toThrow();
  });

  it('어휘와 문제 합계가 1개에서 100개인 요청만 허용한다', () => {
    expect(() =>
      contentImportRequestSchema.parse({
        schemaVersion: 1,
        vocabularies: [],
        questions: [],
      }),
    ).toThrow();
    expect(() =>
      contentImportRequestSchema.parse({
        schemaVersion: 1,
        vocabularies: Array.from({ length: 101 }, (_, index) => ({
          ...vocabulary,
          clientRef: `vocabulary.${index}`,
        })),
        questions: [],
      }),
    ).toThrow();
  });
});

describe('관리자 콘텐츠 가져오기 HTTP와 공개 응답 계약', () => {
  it('UUID Idempotency-Key·path와 페이지 query를 검증한다', () => {
    const header = idempotencyKeyHeaderSchema.parse({
      'idempotency-key': ids.import,
    });
    const path = contentImportIdPathSchema.parse({ importId: ids.import });

    expect(header).toEqual({ 'idempotency-key': ids.import });
    expect(path).toEqual({
      importId: ids.import,
    });
    expectTypeOf(header).toEqualTypeOf<ContentImportIdempotencyKeyHeader>();
    expectTypeOf(path).toEqualTypeOf<ContentImportIdPath>();
    expect(contentImportListQuerySchema.parse({ page: '2' })).toEqual({
      page: 2,
      pageSize: 20,
    });
    expect(() =>
      idempotencyKeyHeaderSchema.parse({ 'idempotency-key': 'not-a-uuid' }),
    ).toThrow();
    expect(() =>
      contentImportListQuerySchema.parse({ pageSize: '101' }),
    ).toThrow();
  });

  it('항목별 공개 결과는 source index·상태·대상·구조화 오류만 담는다', () => {
    const response = {
      id: ids.import,
      status: 'COMPLETED_WITH_FAILURES',
      vocabularyCount: 1,
      questionCount: 1,
      importedCount: 1,
      rejectedCount: 1,
      createdAt: '2026-07-24T00:00:00.000Z',
      completedAt: '2026-07-24T00:00:01.000Z',
      items: [
        {
          kind: 'VOCABULARY',
          sourceIndex: 0,
          status: 'IMPORTED',
          targetId: ids.target,
          errors: [],
        },
        {
          kind: 'QUESTION',
          sourceIndex: 0,
          status: 'REJECTED',
          targetId: null,
          errors: [{ path: 'options.0', code: 'IMPORT_CONTENT_INVALID' }],
        },
      ],
    } as const;

    expect(contentImportDetailResponseSchema.parse(response)).toEqual(response);
    for (const internal of [
      { requestHash: 'secret-hash' },
      { referenceMap: { client: ids.target } },
      { rawJson: request },
    ]) {
      expect(() =>
        contentImportDetailResponseSchema.parse({ ...response, ...internal }),
      ).toThrow();
    }
  });

  it('공개 요약의 항목 합계·처리 합계와 최종 상태를 일관되게 검증한다', () => {
    const summary = {
      id: ids.import,
      status: 'COMPLETED',
      vocabularyCount: 1,
      questionCount: 0,
      importedCount: 1,
      rejectedCount: 0,
      createdAt: '2026-07-24T00:00:00.000Z',
      completedAt: '2026-07-24T00:00:01.000Z',
    } as const;

    expect(contentImportSummarySchema.parse(summary)).toEqual(summary);
    expectTypeOf(
      contentImportSummarySchema.parse(summary),
    ).toEqualTypeOf<ContentImportSummary>();
    for (const invalid of [
      {
        ...summary,
        vocabularyCount: 0,
        importedCount: 0,
      },
      {
        ...summary,
        vocabularyCount: 101,
        importedCount: 101,
      },
      {
        ...summary,
        importedCount: 0,
      },
      {
        ...summary,
        importedCount: 0,
        rejectedCount: 1,
      },
      {
        ...summary,
        status: 'COMPLETED_WITH_FAILURES',
      },
    ]) {
      expect(() => contentImportSummarySchema.parse(invalid)).toThrow();
    }
  });

  it('상세 항목은 kind별 source index와 요약 count·status를 정확히 재구성한다', () => {
    const detail = {
      id: ids.import,
      status: 'COMPLETED_WITH_FAILURES',
      vocabularyCount: 2,
      questionCount: 1,
      importedCount: 2,
      rejectedCount: 1,
      createdAt: '2026-07-24T00:00:00.000Z',
      completedAt: '2026-07-24T00:00:01.000Z',
      items: [
        {
          kind: 'VOCABULARY',
          sourceIndex: 0,
          status: 'IMPORTED',
          targetId: ids.target,
          errors: [],
        },
        {
          kind: 'VOCABULARY',
          sourceIndex: 1,
          status: 'REJECTED',
          targetId: null,
          errors: [{ path: 'thai', code: 'IMPORT_CONTENT_INVALID' }],
        },
        {
          kind: 'QUESTION',
          sourceIndex: 0,
          status: 'IMPORTED',
          targetId: ids.target,
          errors: [],
        },
      ],
    } as const;

    expect(contentImportDetailResponseSchema.parse(detail)).toEqual(detail);
    expectTypeOf(
      contentImportDetailResponseSchema.parse(detail).items[0]!,
    ).toEqualTypeOf<ContentImportItemResult>();
    expect(() =>
      contentImportDetailResponseSchema.parse({
        ...detail,
        items: detail.items.slice(0, 2),
      }),
    ).toThrow();
    expect(() =>
      contentImportDetailResponseSchema.parse({
        ...detail,
        items: [
          detail.items[0],
          { ...detail.items[1], sourceIndex: 0 },
          detail.items[2],
        ],
      }),
    ).toThrow();
    expect(() =>
      contentImportDetailResponseSchema.parse({
        ...detail,
        items: [
          detail.items[0],
          detail.items[1],
          { ...detail.items[2], sourceIndex: 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      contentImportDetailResponseSchema.parse({
        ...detail,
        items: [
          detail.items[0],
          detail.items[1],
          {
            ...detail.items[2],
            status: 'REJECTED',
            targetId: null,
            errors: [{ path: 'blocks', code: 'IMPORT_CONTENT_INVALID' }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      contentImportDetailResponseSchema.parse({
        ...detail,
        items: [
          detail.items[0],
          detail.items[1],
          { ...detail.items[2], kind: 'VOCABULARY' },
        ],
      }),
    ).toThrow();
  });
});
