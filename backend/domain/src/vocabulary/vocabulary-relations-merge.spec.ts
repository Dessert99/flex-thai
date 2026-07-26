/** 어휘 뜻 관계와 stale-safe 병합의 업무 불변 조건을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertMeaningRelation,
  assertMeaningRelationStatusTransition,
  assertVocabularyMergePair,
  createVocabularyMergeFingerprint,
  getNormalizedCodePointDistance,
  VocabularyRelationsMergeError,
  type VocabularyMergeGraph,
} from './vocabulary-relations-merge.js';

const sourceGraph = (
  overrides: Partial<VocabularyMergeGraph['vocabulary']> = {},
): VocabularyMergeGraph => ({
  vocabulary: {
    id: '00000000-0000-4000-8000-000000000001',
    thai: 'สวัสดี',
    normalizedThai: 'สวัสดี',
    kind: 'WORD',
    status: 'DRAFT',
    mergedIntoVocabularyId: null,
    updatedAt: '2026-07-27T00:00:00.000Z',
    ...overrides,
  },
  meanings: ['00000000-0000-4000-8000-000000000011'],
  pronunciations: ['00000000-0000-4000-8000-000000000021'],
  meaningPronunciations: [
    '00000000-0000-4000-8000-000000000011:00000000-0000-4000-8000-000000000021',
  ],
  relations: [],
  incomingMergeSourceIds: [],
  tokenOccurrenceIds: [],
  expressionOccurrenceIds: [],
  savedMemberships: [],
  wordbookMemberships: [],
  practiceQuestionIds: [],
});

describe('뜻 관계 불변 조건', () => {
  it('자기 관계를 거절한다', () => {
    expect(() =>
      assertMeaningRelation({
        sourceMeaningId: 'meaning-a',
        targetMeaningId: 'meaning-a',
        type: 'SYNONYM',
        direction: 'DIRECTED',
      }),
    ).toThrow(new VocabularyRelationsMergeError('MEANING_RELATION_SELF'));
  });

  it('양방향 관계 endpoint를 UUID 순서로 정규화한다', () => {
    expect(
      assertMeaningRelation({
        sourceMeaningId: 'meaning-z',
        targetMeaningId: 'meaning-a',
        type: 'RELATED',
        direction: 'BIDIRECTIONAL',
      }),
    ).toEqual({
      sourceMeaningId: 'meaning-a',
      targetMeaningId: 'meaning-z',
      type: 'RELATED',
      direction: 'BIDIRECTIONAL',
    });
  });

  it('검토 상태는 PENDING을 거쳐서만 terminal 사이를 이동한다', () => {
    expect(() =>
      assertMeaningRelationStatusTransition('PASSED', 'FAILED'),
    ).toThrow(
      new VocabularyRelationsMergeError('MEANING_RELATION_STATE_CONFLICT'),
    );
    expect(assertMeaningRelationStatusTransition('PASSED', 'PENDING')).toBe(
      'PENDING',
    );
    expect(assertMeaningRelationStatusTransition('PENDING', 'FAILED')).toBe(
      'FAILED',
    );
  });
});

describe('어휘 병합 불변 조건', () => {
  it('같은 kind의 PUBLISHED 대표에만 DRAFT·HIDDEN·PUBLISHED source를 병합한다', () => {
    const representative = sourceGraph({
      id: '00000000-0000-4000-8000-000000000002',
      status: 'PUBLISHED',
    });

    for (const status of ['DRAFT', 'HIDDEN', 'PUBLISHED'] as const) {
      expect(
        assertVocabularyMergePair(sourceGraph({ status }), representative),
      ).toEqual({
        sourceId: sourceGraph().vocabulary.id,
        representativeId: representative.vocabulary.id,
      });
    }
  });

  it('MERGED source·비공개 대표·다른 kind·자기 병합으로 chain을 만들지 않는다', () => {
    const representative = sourceGraph({
      id: '00000000-0000-4000-8000-000000000002',
      status: 'PUBLISHED',
    });
    const invalidPairs: Array<[VocabularyMergeGraph, VocabularyMergeGraph]> = [
      [
        sourceGraph({
          status: 'MERGED',
          mergedIntoVocabularyId: representative.vocabulary.id,
        }),
        representative,
      ],
      [
        sourceGraph(),
        sourceGraph({ ...representative.vocabulary, status: 'HIDDEN' }),
      ],
      [
        sourceGraph(),
        sourceGraph({ ...representative.vocabulary, kind: 'EXPRESSION' }),
      ],
      [sourceGraph(), sourceGraph()],
    ];

    for (const [source, target] of invalidPairs) {
      expect(() => assertVocabularyMergePair(source, target)).toThrow(
        VocabularyRelationsMergeError,
      );
    }
  });

  it('이미 다른 MERGED 어휘의 대표인 source는 재병합하지 않는다', () => {
    const source = sourceGraph();
    source.incomingMergeSourceIds = ['00000000-0000-4000-8000-000000000099'];

    expect(() =>
      assertVocabularyMergePair(
        source,
        sourceGraph({
          id: '00000000-0000-4000-8000-000000000002',
          status: 'PUBLISHED',
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'VOCABULARY_MERGE_SOURCE_INVALID' }),
    );
  });

  it('graph 순서와 무관한 opaque fingerprint를 만들고 live 참조 변경은 감지한다', () => {
    const source = sourceGraph({
      thai: 'สวัสดี',
      normalizedThai: 'สวัสดี',
    });
    const representative = sourceGraph({
      id: '00000000-0000-4000-8000-000000000002',
      status: 'PUBLISHED',
    });
    const reordered = {
      ...source,
      meanings: [...source.meanings].reverse(),
    };

    const token = createVocabularyMergeFingerprint(source, representative);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(createVocabularyMergeFingerprint(reordered, representative)).toBe(
      token,
    );
    expect(
      createVocabularyMergeFingerprint(
        { ...source, tokenOccurrenceIds: ['token-new'] },
        representative,
      ),
    ).not.toBe(token);
  });

  it('관계 endpoint·메타데이터·상태·수정 시각을 fingerprint에 포함한다', () => {
    const source = sourceGraph();
    const representative = sourceGraph({
      id: '00000000-0000-4000-8000-000000000002',
      status: 'PUBLISHED',
    });
    source.relations = [
      {
        id: '00000000-0000-4000-8000-000000000090',
        sourceMeaningId: source.meanings[0]!,
        targetMeaningId: representative.meanings[0]!,
        type: 'RELATED',
        direction: 'DIRECTED',
        status: 'PENDING',
        updatedAt: '2026-07-27T00:00:00.000Z',
      },
    ];
    const before = createVocabularyMergeFingerprint(source, representative);

    source.relations[0] = { ...source.relations[0]!, status: 'PASSED' };

    expect(createVocabularyMergeFingerprint(source, representative)).not.toBe(
      before,
    );
  });

  it('관리자 비교용 Unicode code point Levenshtein 거리만 계산한다', () => {
    expect(getNormalizedCodePointDistance('กา', 'ก่า')).toBe(1);
    expect(getNormalizedCodePointDistance('👩‍💻', '👩‍🔬')).toBe(1);
  });
});
