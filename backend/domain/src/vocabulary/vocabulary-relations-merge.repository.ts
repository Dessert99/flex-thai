/** 뜻 관계 CRUD와 SERIALIZABLE 병합을 외부 저장 기술에 요구하는 port를 정의한다 */
import type {
  MeaningRelationDirection,
  MeaningRelationStatus,
  MeaningRelationType,
  VocabularyMergeGraph,
} from './vocabulary-relations-merge.js';

/** 관계 생성 전 뜻 소유 어휘를 확인하는 projection */
export interface VocabularyMeaningOwner {
  meaningId: string;
  vocabularyId: string;
}

/** 관리자 관계 API에 반환할 저장 관계 */
export interface VocabularyRelationsMergeStoredRelation {
  id: string;
  vocabularyId: string;
  sourceMeaningId: string;
  targetMeaningId: string;
  type: MeaningRelationType;
  direction: MeaningRelationDirection;
  status: MeaningRelationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** 병합 후 이동 수 */
export interface VocabularyMergeMovedCounts {
  meanings: number;
  pronunciations: number;
  meaningPronunciations: number;
  tokenOccurrences: number;
  expressionOccurrences: number;
  savedMemberships: number;
  wordbookMemberships: number;
  practiceQuestions: number;
}

/** 원자 병합 결과 */
export interface VocabularyMergeStoredResult {
  sourceVocabularyId: string;
  representativeVocabularyId: string;
  movedCounts: VocabularyMergeMovedCounts;
}

/** 관계 쓰기와 병합 graph 재검증을 구현하는 저장소 경계 */
export interface VocabularyRelationsMergeRepository {
  findMeaningOwners(meaningIds: string[]): Promise<VocabularyMeaningOwner[]>;
  createRelation(
    relation: VocabularyRelationsMergeStoredRelation,
  ): Promise<VocabularyRelationsMergeStoredRelation>;
  findRelation(input: {
    vocabularyId: string;
    relationId: string;
  }): Promise<VocabularyRelationsMergeStoredRelation | null>;
  updateRelation(
    relation: VocabularyRelationsMergeStoredRelation,
  ): Promise<VocabularyRelationsMergeStoredRelation>;
  deleteRelation(input: {
    vocabularyId: string;
    relationId: string;
  }): Promise<boolean>;
  loadMergePair(
    sourceVocabularyId: string,
    representativeVocabularyId: string,
  ): Promise<{
    source: VocabularyMergeGraph;
    representative: VocabularyMergeGraph;
  } | null>;
  executeMerge(input: {
    sourceVocabularyId: string;
    representativeVocabularyId: string;
    expectedFingerprint: string;
    actorSub: string;
    actorUserId: string;
    requestId: string;
    occurredAt: Date;
  }): Promise<VocabularyMergeStoredResult>;
}

/** DB unique·stale·not-found를 domain service가 안정적으로 해석할 저장 오류 */
export class VocabularyRelationsMergeRepositoryError extends Error {
  constructor(
    readonly code:
      | 'MEANING_RELATION_DUPLICATE'
      | 'MEANING_RELATION_NOT_FOUND'
      | 'VOCABULARY_MERGE_CONFLICT'
      | 'VOCABULARY_NOT_FOUND',
  ) {
    super(code);
    this.name = 'VocabularyRelationsMergeRepositoryError';
  }
}
