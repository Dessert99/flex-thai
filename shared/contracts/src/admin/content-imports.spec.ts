/** 관리자 콘텐츠 가져오기 요청과 공개 결과 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  canonicalSentenceInputSchema,
  contentImportDetailResponseSchema,
  contentImportIdPathSchema,
  contentImportListQuerySchema,
  contentImportRequestSchema,
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
    { clientRef: 'option.correct', position: 0, sentence },
    { clientRef: 'option.wrong', position: 1, sentence },
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
    expect(contentImportRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      contentImportRequestSchema.parse({ ...request, schemaVersion: 2 }),
    ).toThrow();
    expect(() =>
      contentImportRequestSchema.parse({ ...request, rawJson: '{}' }),
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
    expect(
      idempotencyKeyHeaderSchema.parse({ 'idempotency-key': ids.import }),
    ).toEqual({ 'idempotency-key': ids.import });
    expect(contentImportIdPathSchema.parse({ importId: ids.import })).toEqual({
      importId: ids.import,
    });
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
});
