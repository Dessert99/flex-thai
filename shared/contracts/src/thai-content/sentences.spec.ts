/** 문제와 어휘가 공유하는 태국어 문장 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import { publicThaiSentenceSchema } from './sentences.js';

const ids = {
  sentence: '00000000-0000-4000-8000-000000000001',
  vocabulary: '00000000-0000-4000-8000-000000000002',
  meaning: '00000000-0000-4000-8000-000000000003',
  pronunciation: '00000000-0000-4000-8000-000000000004',
} as const;

const sentence = {
  sentenceVersionId: ids.sentence,
  originalText: 'ฉันรักภาษาไทย',
  translationKo: '나는 태국어를 사랑한다',
  pronunciationKo: '찬 락 파싸 타이',
  toneMarks: 'R H M M',
  audioUrl: 'https://media.example/sentence',
  tokens: [
    {
      position: 0,
      surface: 'ฉัน',
      startOffset: 0,
      endOffset: 3,
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      pronunciationId: ids.pronunciation,
      contextMeaningKo: '나',
      pronunciationKo: '찬',
      toneMarks: 'R',
      audioUrl: 'https://media.example/token',
      role: 'TARGET',
    },
  ],
  expressions: [
    {
      startTokenIndex: 0,
      endTokenIndex: 1,
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      pronunciationId: ids.pronunciation,
      contextMeaningKo: '나',
      pronunciationKo: '찬',
      toneMarks: 'R',
      audioUrl: 'https://media.example/expression',
      representative: true,
    },
  ],
} as const;

describe('공개 태국어 문장 계약', () => {
  it('단어와 대표 표현의 학습 피드백을 공개한다', () => {
    const parsed = publicThaiSentenceSchema.parse(sentence);

    expect(parsed.tokens[0]?.contextMeaningKo).toBe('나');
    expect(parsed.expressions[0]?.representative).toBe(true);
  });

  it('내부 media storage key를 거부한다', () => {
    expect(() =>
      publicThaiSentenceSchema.parse({
        ...sentence,
        mediaStorageKey: 'private/sentence.mp3',
      }),
    ).toThrow();
  });
});
