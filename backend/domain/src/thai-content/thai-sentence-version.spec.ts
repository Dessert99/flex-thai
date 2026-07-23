/** 문장 버전의 Unicode offset·표현 범위·동결 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertThaiSentenceVersionMutable,
  resolveRepresentativeExpressions,
  validateThaiSentenceVersion,
  type ThaiSentenceVersionInput,
} from './thai-sentence-version.js';

const sentence = (): ThaiSentenceVersionInput => ({
  originalText: 'ก😀ข',
  translationKo: '번역',
  pronunciationKo: '발음',
  toneMarks: '성조',
  mediaAssetId: 'media-id',
  tokens: [
    {
      position: 0,
      surface: 'ก',
      startOffset: 0,
      endOffset: 1,
      vocabularyId: 'vocabulary-1',
      meaningId: 'meaning-1',
      pronunciationId: 'pronunciation-1',
      contextMeaningKo: '뜻',
      role: 'TARGET',
    },
    {
      position: 1,
      surface: '😀',
      startOffset: 1,
      endOffset: 2,
      vocabularyId: 'vocabulary-2',
      meaningId: 'meaning-2',
      pronunciationId: 'pronunciation-2',
      contextMeaningKo: '표정',
      role: 'SUPPORTING',
    },
  ],
  expressions: [],
});

describe('ThaiSentenceVersion', () => {
  it('offset을 UTF-16 code unit이 아니라 Unicode code point로 해석한다', () => {
    expect(validateThaiSentenceVersion(sentence())).toEqual([]);
  });

  it('원문 범위와 surface가 다르면 경로가 있는 오류를 반환한다', () => {
    const input = sentence();
    input.tokens[1] = { ...input.tokens[1]!, surface: 'ข' };

    expect(validateThaiSentenceVersion(input)).toContainEqual({
      path: 'tokens.1.surface',
      code: 'TOKEN_SURFACE_MISMATCH',
    });
  });

  it('소수 token offset은 원문 범위 오류로 반환한다', () => {
    const fractionalStart = sentence();
    fractionalStart.tokens[0] = {
      ...fractionalStart.tokens[0]!,
      startOffset: 0.5,
    };
    const fractionalEnd = sentence();
    fractionalEnd.tokens[0] = {
      ...fractionalEnd.tokens[0]!,
      endOffset: 1.5,
    };

    expect(validateThaiSentenceVersion(fractionalStart)).toContainEqual({
      path: 'tokens.0',
      code: 'TOKEN_RANGE_INVALID',
    });
    expect(validateThaiSentenceVersion(fractionalEnd)).toContainEqual({
      path: 'tokens.0',
      code: 'TOKEN_RANGE_INVALID',
    });
  });

  it('소수 표현 token index는 표현 범위 오류로 반환한다', () => {
    const fractionalStart = sentence();
    fractionalStart.expressions = [
      {
        startTokenIndex: 0.5,
        endTokenIndex: 1,
        vocabularyId: 'expression-1',
        adminSelected: false,
      },
    ];
    const fractionalEnd = sentence();
    fractionalEnd.expressions = [
      {
        startTokenIndex: 0,
        endTokenIndex: 1.5,
        vocabularyId: 'expression-1',
        adminSelected: false,
      },
    ];

    expect(validateThaiSentenceVersion(fractionalStart)).toContainEqual({
      path: 'expressions.0',
      code: 'EXPRESSION_RANGE_INVALID',
    });
    expect(validateThaiSentenceVersion(fractionalEnd)).toContainEqual({
      path: 'expressions.0',
      code: 'EXPRESSION_RANGE_INVALID',
    });
  });

  it('유효하지 않은 앞 토큰 범위는 뒤의 유효한 토큰 겹침으로 이어지지 않는다', () => {
    const input = sentence();
    input.tokens[0] = { ...input.tokens[0]!, endOffset: 1.5 };

    expect(validateThaiSentenceVersion(input)).toEqual([
      { path: 'tokens.0', code: 'TOKEN_RANGE_INVALID' },
    ]);
  });

  it('겹치는 표현은 관리자 지정, 길이, 시작 위치 순으로 대표를 고른다', () => {
    expect(
      resolveRepresentativeExpressions([
        {
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: 'short',
          adminSelected: true,
        },
        {
          startTokenIndex: 0,
          endTokenIndex: 3,
          vocabularyId: 'long',
          adminSelected: false,
        },
        {
          startTokenIndex: 4,
          endTokenIndex: 5,
          vocabularyId: 'separate',
          adminSelected: false,
        },
      ]),
    ).toEqual([
      expect.objectContaining({ vocabularyId: 'short', representative: true }),
      expect.objectContaining({ vocabularyId: 'long', representative: false }),
      expect.objectContaining({
        vocabularyId: 'separate',
        representative: true,
      }),
    ]);
  });

  it('전이적으로 겹친 표현도 하나의 대표 선택군으로 묶는다', () => {
    expect(
      resolveRepresentativeExpressions([
        {
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: 'first',
          adminSelected: false,
        },
        {
          startTokenIndex: 1,
          endTokenIndex: 3,
          vocabularyId: 'middle',
          adminSelected: false,
        },
        {
          startTokenIndex: 2,
          endTokenIndex: 4,
          vocabularyId: 'last',
          adminSelected: false,
        },
      ]),
    ).toEqual([
      expect.objectContaining({ vocabularyId: 'first', representative: true }),
      expect.objectContaining({
        vocabularyId: 'middle',
        representative: false,
      }),
      expect.objectContaining({ vocabularyId: 'last', representative: false }),
    ]);
  });

  it('우선순위가 완전히 같으면 입력 순서의 첫 표현을 대표로 고른다', () => {
    expect(
      resolveRepresentativeExpressions([
        {
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: 'first',
          adminSelected: false,
        },
        {
          startTokenIndex: 0,
          endTokenIndex: 2,
          vocabularyId: 'second',
          adminSelected: false,
        },
      ]),
    ).toEqual([
      expect.objectContaining({ vocabularyId: 'first', representative: true }),
      expect.objectContaining({
        vocabularyId: 'second',
        representative: false,
      }),
    ]);
  });

  it('표현이 없으면 빈 대표 표현 목록을 반환한다', () => {
    expect(resolveRepresentativeExpressions([])).toEqual([]);
  });

  it('동결된 문장 버전은 수정할 수 없다', () => {
    expect(() => assertThaiSentenceVersionMutable(new Date())).toThrowError(
      expect.objectContaining({ code: 'THAI_SENTENCE_VERSION_IMMUTABLE' }),
    );
  });
});
