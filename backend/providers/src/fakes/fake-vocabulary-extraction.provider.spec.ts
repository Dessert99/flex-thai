/** local AI 추출기가 text fixture별 후보를 재현하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeVocabularyExtractionProvider } from './fake-vocabulary-extraction.provider.js';

describe('FakeVocabularyExtractionProvider', () => {
  it('등록한 text의 후보 snapshot을 반환한다', async () => {
    const provider = new FakeVocabularyExtractionProvider({
      สวัสดี: [
        {
          thai: 'สวัสดี',
          kind: 'WORD',
          meanings: [
            { meaningKo: '안녕하세요', partOfSpeech: '감탄사', difficulty: 1 },
          ],
        },
      ],
    });

    const candidates = await provider.extract({
      text: 'สวัสดี',
      preset: {
        id: 'preset-id',
        name: '어휘 추출',
        purpose: 'VOCABULARY_EXTRACTION',
        version: 1,
        parameters: {},
      },
      signal: new AbortController().signal,
    });

    expect(candidates[0]?.thai).toBe('สวัสดี');
  });
});
