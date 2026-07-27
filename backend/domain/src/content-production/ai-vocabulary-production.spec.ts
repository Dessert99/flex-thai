/** AI 어휘 후보의 중복 분류와 검증 결과가 결정적인지 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  evaluateVocabularyCandidate,
  readVocabularyProductionPolicy,
  runVocabularyProviderOperation,
  VocabularyProviderCallError,
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

  it('기존 뜻과 새 뜻이 섞이면 전체를 기존 뜻으로 오분류하지 않는다', async () => {
    const result = await evaluateVocabularyCandidate({
      candidate: {
        ...candidate,
        meanings: [
          ...candidate.meanings,
          { meaningKo: '새로운 뜻', partOfSpeech: '명사', difficulty: 2 },
        ],
      },
      ordinal: 0,
      lookup: lookup(
        {
          vocabularyId: 'exact-id',
          meanings: [{ meaningKo: '안녕 하세요' }],
        },
        [],
      ),
      policy: { suspectedDuplicateMaxCodePointDistance: 1 },
    });

    expect(result.candidate.classification).toBe('EXACT_NEW_MEANING');
    expect(result.candidate.resultGroup).toBe('NORMAL');
  });

  it('preset의 의심 중복 거리는 0부터 3 사이 정수만 허용한다', () => {
    expect(() =>
      readVocabularyProductionPolicy({
        suspectedDuplicateMaxCodePointDistance: 4,
      }),
    ).toThrowError('INVALID_DUPLICATE_POLICY');
  });
});

describe('AI 어휘 provider 실행 수명', () => {
  const execution = {
    jobItemId: 'item-id',
    jobAttempt: 1,
    operation: 'VOCABULARY_EXTRACTION',
    sequence: 0,
    provider: 'LOCAL_FAKE',
    model: 'deterministic-v1',
    promptVersion: 'v1',
    itemLeaseToken: 'lease-token',
  } as const;

  it('이미 성공한 실행은 저장 결과를 replay하고 provider를 호출하지 않는다', async () => {
    let callCount = 0;
    const result = await runVocabularyProviderOperation(
      execution,
      {
        claim: () =>
          Promise.resolve({
            kind: 'REPLAY',
            result: { kind: 'TEXT', text: '저장 결과' },
          }),
        succeed: () => Promise.resolve(true),
        fail: () => Promise.resolve(true),
      },
      () => {
        callCount += 1;
        return Promise.resolve({ kind: 'TEXT', text: '새 결과' });
      },
    );

    expect(callCount).toBe(0);
    expect(result).toEqual({
      status: 'SUCCEEDED',
      result: { kind: 'TEXT', text: '저장 결과' },
    });
  });

  it('결과 불명 실행은 같은 attempt에서 provider를 다시 호출하지 않는다', async () => {
    let callCount = 0;
    const result = await runVocabularyProviderOperation(
      execution,
      {
        claim: () => Promise.resolve({ kind: 'OUTCOME_UNKNOWN' }),
        succeed: () => Promise.resolve(true),
        fail: () => Promise.resolve(true),
      },
      () => {
        callCount += 1;
        return Promise.resolve({ kind: 'TEXT', text: '새 결과' });
      },
    );

    expect(callCount).toBe(0);
    expect(result).toEqual({
      status: 'OUTCOME_UNKNOWN',
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      retryable: true,
    });
  });

  it('새 실행 결과를 terminal로 저장한 뒤 반환한다', async () => {
    const completed: unknown[] = [];
    const result = await runVocabularyProviderOperation(
      execution,
      {
        claim: () => Promise.resolve({ kind: 'CLAIMED', runId: 'run-id' }),
        succeed: (_runId, value) => {
          completed.push(value);
          return Promise.resolve(true);
        },
        fail: () => Promise.resolve(true),
      },
      () => Promise.resolve({ kind: 'TEXT', text: '새 결과' }),
    );

    expect(completed).toEqual([{ kind: 'TEXT', text: '새 결과' }]);
    expect(result.status).toBe('SUCCEEDED');
  });

  it('성공 결과를 durable 저장하지 못하면 성공으로 반환하지 않는다', async () => {
    const result = await runVocabularyProviderOperation(
      execution,
      {
        claim: () => Promise.resolve({ kind: 'CLAIMED', runId: 'run-id' }),
        succeed: () => Promise.resolve(false),
        fail: () => Promise.resolve(false),
      },
      () => Promise.resolve({ kind: 'TEXT', text: '저장되지 않은 결과' }),
    );

    expect(result).toEqual({
      status: 'OUTCOME_UNKNOWN',
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      retryable: true,
    });
  });

  it('응답 수신 여부가 불명확한 오류를 outcome unknown으로 저장한다', async () => {
    const failures: unknown[] = [];
    const result = await runVocabularyProviderOperation(
      execution,
      {
        claim: () => Promise.resolve({ kind: 'CLAIMED', runId: 'run-id' }),
        succeed: () => Promise.resolve(true),
        fail: (_runId, failure) => {
          failures.push(failure);
          return Promise.resolve(true);
        },
      },
      () =>
        Promise.reject(
          new VocabularyProviderCallError(
            'PROVIDER_TRANSPORT_CLOSED',
            true,
            false,
          ),
        ),
    );

    expect(failures).toEqual([
      {
        status: 'OUTCOME_UNKNOWN',
        errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
        retryable: true,
      },
    ]);
    expect(result.status).toBe('OUTCOME_UNKNOWN');
  });
});
