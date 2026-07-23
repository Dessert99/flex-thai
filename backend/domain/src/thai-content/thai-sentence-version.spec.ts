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

  it('동결된 문장 버전은 수정할 수 없다', () => {
    expect(() =>
      assertThaiSentenceVersionMutable(new Date()),
    ).toThrowError(
      expect.objectContaining({ code: 'THAI_SENTENCE_VERSION_IMMUTABLE' }),
    );
  });
});
