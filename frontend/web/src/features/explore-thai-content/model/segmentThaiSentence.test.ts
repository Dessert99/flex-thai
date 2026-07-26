/** 태국어 문장의 Unicode code point segmentation을 검증한다 */
import type { PublicThaiSentence } from '@flex-thia/contracts';
import { describe, expect, it } from 'vitest';
import { segmentThaiSentence } from './segmentThaiSentence';

const sentence = {
  sentenceVersionId: '00000000-0000-4000-8000-000000000001',
  originalText: '😀 ก!',
  translationKo: '이모지 꺼',
  pronunciationKo: '꺼',
  toneMarks: '-',
  audioUrl: null,
  tokens: [
    {
      position: 0,
      surface: '😀',
      startOffset: 0,
      endOffset: 1,
      vocabularyId: '00000000-0000-4000-8000-000000000002',
      meaningId: '00000000-0000-4000-8000-000000000003',
      pronunciationId: '00000000-0000-4000-8000-000000000004',
      contextMeaningKo: '표정',
      pronunciationKo: '이모지',
      toneMarks: '-',
      audioUrl: null,
      role: 'TARGET',
    },
    {
      position: 1,
      surface: 'ก',
      startOffset: 2,
      endOffset: 3,
      vocabularyId: '00000000-0000-4000-8000-000000000005',
      meaningId: '00000000-0000-4000-8000-000000000006',
      pronunciationId: '00000000-0000-4000-8000-000000000007',
      contextMeaningKo: '꺼',
      pronunciationKo: '꺼',
      toneMarks: '-',
      audioUrl: null,
      role: 'SUPPORTING',
    },
  ],
  expressions: [],
} satisfies PublicThaiSentence;

describe('태국어 문장 segmentation', () => {
  it('Unicode 문자와 원문 공백 및 문장부호를 손실 없이 분리한다', () => {
    expect(segmentThaiSentence(sentence)).toEqual([
      { kind: 'TOKEN', text: '😀', tokenIndex: 0 },
      { kind: 'TEXT', text: ' ' },
      { kind: 'TOKEN', text: 'ก', tokenIndex: 1 },
      { kind: 'TEXT', text: '!' },
    ]);
  });
});
