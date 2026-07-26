/** 뜻 관계의 검토 상태와 stale-safe 어휘 병합 fingerprint 규칙을 정의한다 */
import { createHash } from 'node:crypto';

/** 뜻 관계 종류 */
export type MeaningRelationType = 'SYNONYM' | 'ANTONYM' | 'RELATED';

/** 뜻 관계 탐색 방향 */
export type MeaningRelationDirection = 'DIRECTED' | 'BIDIRECTIONAL';

/** 뜻 관계 관리자 검토 상태 */
export type MeaningRelationStatus = 'PENDING' | 'PASSED' | 'FAILED';

/** 관계 생성·수정 전 canonical endpoint를 계산할 입력 */
export interface MeaningRelationInput {
  sourceMeaningId: string;
  targetMeaningId: string;
  type: MeaningRelationType;
  direction: MeaningRelationDirection;
}

/** 병합 stale 판정에 포함하는 어휘 graph */
export interface VocabularyMergeGraph {
  vocabulary: {
    id: string;
    thai: string;
    normalizedThai: string;
    kind: 'WORD' | 'EXPRESSION';
    status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'MERGED';
    mergedIntoVocabularyId: string | null;
    updatedAt: string;
  };
  meanings: string[];
  pronunciations: string[];
  meaningPronunciations: string[];
  relationIds: string[];
  tokenOccurrenceIds: string[];
  expressionOccurrenceIds: string[];
  savedMemberships: string[];
  wordbookMemberships: string[];
  practiceQuestionIds: string[];
}

/** 관계·병합 예상 실패를 API가 안정적으로 분기할 code로 전달한다 */
export class VocabularyRelationsMergeError extends Error {
  constructor(
    readonly code:
      | 'MEANING_RELATION_SELF'
      | 'MEANING_RELATION_STATE_CONFLICT'
      | 'VOCABULARY_MERGE_SAME_TARGET'
      | 'VOCABULARY_MERGE_SOURCE_INVALID'
      | 'VOCABULARY_MERGE_REPRESENTATIVE_INVALID'
      | 'VOCABULARY_MERGE_KIND_MISMATCH',
  ) {
    super(code);
    this.name = 'VocabularyRelationsMergeError';
  }
}

/** 자기 관계를 막고 양방향 endpoint를 한 순서로 정규화한다 */
export const assertMeaningRelation = (
  input: MeaningRelationInput,
): MeaningRelationInput => {
  if (input.sourceMeaningId === input.targetMeaningId) {
    throw new VocabularyRelationsMergeError('MEANING_RELATION_SELF');
  }
  if (
    input.direction === 'BIDIRECTIONAL' &&
    input.sourceMeaningId > input.targetMeaningId
  ) {
    return {
      ...input,
      sourceMeaningId: input.targetMeaningId,
      targetMeaningId: input.sourceMeaningId,
    };
  }
  return input;
};

/** terminal 검토 결과 사이 직접 변경을 막아 재검토 의도를 PENDING으로 드러낸다 */
export const assertMeaningRelationStatusTransition = (
  current: MeaningRelationStatus,
  next: MeaningRelationStatus,
): MeaningRelationStatus => {
  if (current !== next && current !== 'PENDING' && next !== 'PENDING') {
    throw new VocabularyRelationsMergeError('MEANING_RELATION_STATE_CONFLICT');
  }
  return next;
};

/** source와 대표의 상태·kind·chain 불변 조건을 검증한다 */
export const assertVocabularyMergePair = (
  source: VocabularyMergeGraph,
  representative: VocabularyMergeGraph,
): { sourceId: string; representativeId: string } => {
  if (source.vocabulary.id === representative.vocabulary.id) {
    throw new VocabularyRelationsMergeError('VOCABULARY_MERGE_SAME_TARGET');
  }
  if (
    source.vocabulary.status === 'MERGED' ||
    source.vocabulary.mergedIntoVocabularyId !== null
  ) {
    throw new VocabularyRelationsMergeError('VOCABULARY_MERGE_SOURCE_INVALID');
  }
  if (
    representative.vocabulary.status !== 'PUBLISHED' ||
    representative.vocabulary.mergedIntoVocabularyId !== null
  ) {
    throw new VocabularyRelationsMergeError(
      'VOCABULARY_MERGE_REPRESENTATIVE_INVALID',
    );
  }
  if (source.vocabulary.kind !== representative.vocabulary.kind) {
    throw new VocabularyRelationsMergeError('VOCABULARY_MERGE_KIND_MISMATCH');
  }
  return {
    sourceId: source.vocabulary.id,
    representativeId: representative.vocabulary.id,
  };
};

const stableGraph = (graph: VocabularyMergeGraph) => ({
  ...graph,
  meanings: [...graph.meanings].sort(),
  pronunciations: [...graph.pronunciations].sort(),
  meaningPronunciations: [...graph.meaningPronunciations].sort(),
  relationIds: [...graph.relationIds].sort(),
  tokenOccurrenceIds: [...graph.tokenOccurrenceIds].sort(),
  expressionOccurrenceIds: [...graph.expressionOccurrenceIds].sort(),
  savedMemberships: [...graph.savedMemberships].sort(),
  wordbookMemberships: [...graph.wordbookMemberships].sort(),
  practiceQuestionIds: [...graph.practiceQuestionIds].sort(),
});

/** 두 live graph의 같은 상태에만 유효한 opaque SHA-256 token을 만든다 */
export const createVocabularyMergeFingerprint = (
  source: VocabularyMergeGraph,
  representative: VocabularyMergeGraph,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        source: stableGraph(source),
        representative: stableGraph(representative),
      }),
      'utf8',
    )
    .digest('base64url');

/** 자동 병합 판단 없이 관리자 비교용 Unicode code point 거리만 계산한다 */
export const getNormalizedCodePointDistance = (
  left: string,
  right: string,
): number => {
  const leftPoints = [...left];
  const rightPoints = [...right];
  let previous = Array.from(
    { length: rightPoints.length + 1 },
    (_, index) => index,
  );

  for (let leftIndex = 0; leftIndex < leftPoints.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < rightPoints.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex]! +
        (leftPoints[leftIndex] === rightPoints[rightIndex] ? 0 : 1);
      current.push(
        Math.min(
          current[rightIndex]! + 1,
          previous[rightIndex + 1]! + 1,
          substitution,
        ),
      );
    }
    previous = current;
  }
  return previous[rightPoints.length] ?? leftPoints.length;
};
