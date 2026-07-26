/** 개념 학습 공개·관리 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  conceptDetailResponseSchema,
  conceptValidationReportSchema,
  createConceptRequestSchema,
  replaceConceptVersionRequestSchema,
} from './concepts.js';

const sentenceVersionId = '11111111-1111-4111-8111-111111111111';
const blockId = '44444444-4444-4444-8444-444444444444';

describe('개념 계약', () => {
  it('세 종류의 개념 블록 입력을 허용한다', () => {
    const parsed = createConceptRequestSchema.parse({
      category: 'GRAMMAR',
      position: 0,
      title: '기본 어순',
      summary: '태국어의 기본 어순을 익힌다.',
      blocks: [
        {
          kind: 'EXPLANATION',
          position: 0,
          heading: '설명',
          paragraphs: ['태국어는 주어-동사-목적어 어순을 따른다.'],
        },
        {
          kind: 'RULE_TABLE',
          position: 1,
          heading: '규칙',
          headers: ['순서', '역할'],
          rows: [['1', '주어']],
        },
        {
          kind: 'THAI_EXAMPLES',
          position: 2,
          heading: '예문',
          examples: [{ position: 0, sentenceVersionId, noteKo: null }],
        },
      ],
    });

    expect(parsed.blocks).toHaveLength(3);
  });

  it('규칙 표의 열 수가 다르면 거부한다', () => {
    expect(() =>
      createConceptRequestSchema.parse({
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '요약',
        blocks: [
          {
            kind: 'RULE_TABLE',
            position: 0,
            heading: '규칙',
            headers: ['순서', '역할'],
            rows: [['1']],
          },
        ],
      }),
    ).toThrow();
  });

  it('교체 요청의 알 수 없는 필드를 거부한다', () => {
    expect(() =>
      replaceConceptVersionRequestSchema.parse({
        revision: 0,
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '요약',
        blocks: [],
        rawHtml: '<b>금지</b>',
      }),
    ).toThrow();
  });

  it('공개 상세에서 내부 media key를 거부한다', () => {
    expect(() =>
      conceptDetailResponseSchema.parse({
        id: '22222222-2222-4222-8222-222222222222',
        versionId: '33333333-3333-4333-8333-333333333333',
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '요약',
        tableOfContents: [{ blockId, heading: '예문', position: 0 }],
        blocks: [
          {
            id: blockId,
            kind: 'THAI_EXAMPLES',
            position: 0,
            heading: '예문',
            examples: [
              {
                position: 0,
                noteKo: null,
                sentence: {
                  sentenceVersionId,
                  originalText: 'ฉันเรียนภาษาไทย',
                  translationKo: '나는 태국어를 공부한다',
                  pronunciationKo: '찬 리안 파싸 타이',
                  toneMarks: '',
                  audioUrl: null,
                  mediaStorageKey: 'private/example.mp3',
                  tokens: [],
                  expressions: [],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('검증 문제의 canonical 근거를 보존한다', () => {
    const parsed = conceptValidationReportSchema.parse({
      versionId: '33333333-3333-4333-8333-333333333333',
      revision: 1,
      status: 'FAILED',
      issues: [
        {
          source: 'REFERENCE',
          path: 'blocks.0.examples.0.sentenceVersionId',
          code: 'CONCEPT_SENTENCE_NOT_FOUND',
          evidenceKo: '문장 버전을 찾을 수 없습니다.',
        },
      ],
      validatedAt: '2026-07-26T00:00:00.000Z',
    });

    expect(parsed.issues[0]?.evidenceKo).toBe(
      '문장 버전을 찾을 수 없습니다.',
    );
  });

  it('공개 블록의 UUID와 하나 이상의 예시를 요구한다', () => {
    const base = {
      id: '22222222-2222-4222-8222-222222222222',
      versionId: '33333333-3333-4333-8333-333333333333',
      category: 'GRAMMAR',
      position: 0,
      title: '기본 어순',
      summary: '요약',
    };
    expect(() =>
      conceptDetailResponseSchema.parse({
        ...base,
        tableOfContents: [{ blockId: 'not-uuid', heading: '예문', position: 0 }],
        blocks: [],
      }),
    ).toThrow();
    expect(() =>
      conceptDetailResponseSchema.parse({
        ...base,
        tableOfContents: [{ blockId, heading: '예문', position: 0 }],
        blocks: [
          {
            id: blockId,
            kind: 'THAI_EXAMPLES',
            position: 0,
            heading: '예문',
            examples: [],
          },
        ],
      }),
    ).toThrow();
  });
});
