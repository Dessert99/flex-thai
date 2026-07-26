/** AI 어휘 후보의 중복 분류와 검증 결과가 결정적인지 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  evaluateVocabularyCandidate,
  readVocabularyProductionPolicy,
  type VocabularyProductionLookup,
} from './ai-vocabulary-production.js';

const candidate = {
  thai: ' สวัสดี\u200B ',
  kind: 'WORD' as const,
  meanings: [
    {
      meaningKo: ' 안녕  하세요 ',
      partOfSpeech: '감탄사',
      difficulty: 1,
    },
  ],
};

const lookup = (
  exact: Awaited<ReturnType<VocabularyProductionLookup['findExact']>>,
  suspected: Readonly<
    Awaited<ReturnType<VocabularyProductionLookup['findSuspected']>>
  >,
): VocabularyProductionLookup => ({
  findExact: () => Promise.resolve(exact),
  findSuspected: () => Promise.resolve([...suspected]),
});

describe('AI 어휘 후보 결정 규칙', () => {
  it.each([
    {
      name: 'exact와 의심 후보가 없으면 신규 어휘',
      exact: null,
      suspected: [],
      classification: 'NEW_VOCABULARY',
      resultGroup: 'NORMAL',
    },
    {
      name: 'exact 어휘에 같은 뜻이 있으면 기존 뜻',
      exact: {
        vocabularyId: 'exact-id',
        meanings: [{ meaningKo: '안녕 하세요' }],
      },
      suspected: [],
      classification: 'EXACT_EXISTING_MEANING',
      resultGroup: 'NEEDS_ATTENTION',
    },
    {
      name: 'exact 어휘에 뜻이 없으면 새 뜻',
      exact: {
        vocabularyId: 'exact-id',
        meanings: [{ meaningKo: '반갑습니다' }],
      },
      suspected: [],
      classification: 'EXACT_NEW_MEANING',
      resultGroup: 'NORMAL',
    },
    {
      name: 'exact가 없고 가까운 어휘가 있으면 의심 중복',
      exact: null,
      suspected: [
        {
          vocabularyId: 'suspect-id',
          normalizedThai: 'สวัสดิ',
          codePointDistance: 1,
        },
      ],
      classification: 'POSSIBLE_DUPLICATE',
      resultGroup: 'NEEDS_ATTENTION',
    },
  ] as const)(
    '$name으로 분류한다',
    async ({ exact, suspected, classification, resultGroup }) => {
      const result = await evaluateVocabularyCandidate({
        candidate,
        ordinal: 0,
        lookup: lookup(exact, suspected),
        policy: { suspectedDuplicateMaxCodePointDistance: 1 },
      });

      expect(result.candidate).toMatchObject({
        normalizedThai: 'สวัสดี',
        classification,
        resultGroup,
      });
    },
  );

  it('schema 위반은 조회하지 않고 실패 후보로 남긴다', async () => {
    let lookupCount = 0;
    const result = await evaluateVocabularyCandidate({
      candidate: { ...candidate, meanings: [] },
      ordinal: 0,
      lookup: {
        findExact: () => {
          lookupCount += 1;
          return Promise.resolve(null);
        },
        findSuspected: () => Promise.resolve([]),
      },
      policy: { suspectedDuplicateMaxCodePointDistance: 1 },
    });

    expect(lookupCount).toBe(0);
    expect(result.candidate).toMatchObject({
      resultGroup: 'FAILED',
      reviewCode: 'VOCABULARY_MEANING_REQUIRED',
    });
    expect(result.validations).toEqual([
      expect.objectContaining({
        stage: 'SCHEMA',
        status: 'FAILED',
        code: 'VOCABULARY_MEANING_REQUIRED',
      }),
    ]);
  });

  it('preset의 의심 중복 거리는 0부터 3 사이 정수만 허용한다', () => {
    expect(() =>
      readVocabularyProductionPolicy({
        suspectedDuplicateMaxCodePointDistance: 4,
      }),
    ).toThrowError('INVALID_DUPLICATE_POLICY');
  });
});
