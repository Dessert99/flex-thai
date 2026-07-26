/** local 교차 검증기가 Thai별 결과를 결정적으로 반환하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeVocabularyCrossValidationProvider } from './fake-vocabulary-cross-validation.provider.js';

describe('FakeVocabularyCrossValidationProvider', () => {
  it('등록하지 않은 후보는 통과시키고 지정 후보는 실패시킨다', async () => {
    const provider = new FakeVocabularyCrossValidationProvider(
      new Map([['ผิด', 'AI_VALIDATION_DISAGREEMENT']]),
    );
    const base = {
      ordinal: 0,
      thai: 'ผิด',
      normalizedThai: 'ผิด',
      kind: 'WORD' as const,
      meanings: [{ meaningKo: '오류', partOfSpeech: '명사', difficulty: 1 }],
      classification: 'NEW_VOCABULARY' as const,
      resultGroup: 'NORMAL' as const,
      matchedVocabularyId: null,
      suspectedMatches: [],
      reviewCode: null,
    };

    await expect(
      provider.validate({
        candidate: base,
        preset: {
          id: 'preset-id',
          name: '어휘 추출',
          purpose: 'VOCABULARY_EXTRACTION',
          version: 1,
          parameters: {},
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: 'FAILED',
      code: 'AI_VALIDATION_DISAGREEMENT',
    });
  });
});
