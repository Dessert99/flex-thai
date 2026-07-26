/** 관리자 어휘의 잠금 조회·전체 교체·상태 전이·audit 원자 저장 port를 정의한다 */
import type { Vocabulary } from './vocabulary.js';

/** 잠근 기존 어휘 child의 참조 판정용 최소 정보 */
export interface VocabularyAdminLockedGraph {
  vocabulary: Vocabulary;
  meanings: Array<{ id: string }>;
  pronunciations: Array<{ id: string; mediaAssetId: string | null }>;
}

/** 교체할 새 뜻 row */
export interface VocabularyAdminMeaningGraph {
  id: string;
  vocabularyId: string;
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number | null;
  contextNote: string | null;
}

/** 교체할 새 발음 row */
export interface VocabularyAdminPronunciationGraph {
  id: string;
  vocabularyId: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
}

/** 새 뜻과 발음의 명시적 연결 row */
export interface VocabularyAdminMeaningPronunciationGraph {
  vocabularyId: string;
  meaningId: string;
  pronunciationId: string;
}

/** DRAFT 어휘와 child 전체를 바꿀 resolved graph */
export interface VocabularyAdminReplacementGraph {
  vocabulary: Vocabulary & { updatedAt: Date };
  meanings: VocabularyAdminMeaningGraph[];
  pronunciations: VocabularyAdminPronunciationGraph[];
  meaningPronunciations: VocabularyAdminMeaningPronunciationGraph[];
}

/** 게시 판단에 필요한 current media 상태 */
export interface VocabularyAdminMediaRecord {
  id: string;
  status: 'UPLOADING' | 'READY' | 'REJECTED';
}

/** 관리자 어휘 변경과 같은 transaction에 append할 감사 입력 */
export interface VocabularyAdminAuditInput {
  actorSub: string;
  actorUserId: string;
  action:
    | 'VOCABULARY_REPLACED'
    | 'VOCABULARY_PUBLISHED'
    | 'VOCABULARY_HIDDEN'
    | 'VOCABULARY_RESTORED';
  targetType: 'VOCABULARY';
  targetId: string;
  summary: Record<string, unknown>;
  requestId: string;
  occurredAt: Date;
}

/** 한 PostgreSQL transaction 안에서만 사용하는 관리자 어휘 저장 연산 */
export interface VocabularyAdminTransaction {
  lockVocabularyGraph(
    vocabularyId: string,
  ): Promise<VocabularyAdminLockedGraph | null>;
  hasQuestionUsage(input: {
    vocabularyId: string;
    meaningIds: string[];
    pronunciationIds: string[];
  }): Promise<boolean>;
  findDuplicateVocabularyId(
    normalizedThai: string,
    excludeVocabularyId: string,
  ): Promise<string | null>;
  findMediaAssetsByIds(
    mediaAssetIds: string[],
  ): Promise<VocabularyAdminMediaRecord[]>;
  replaceVocabulary(graph: VocabularyAdminReplacementGraph): Promise<void>;
  transitionVocabularyStatus(input: {
    vocabularyId: string;
    expectedStatus: Vocabulary['status'];
    nextStatus: Vocabulary['status'];
    publishedAt?: Date | undefined;
    updatedAt: Date;
  }): Promise<void>;
  appendAuditLog(input: VocabularyAdminAuditInput): Promise<void>;
}

/** local PostgreSQL과 Data API가 같은 관리자 어휘 transaction을 실행하게 한다 */
export interface VocabularyAdminRepository {
  runInTransaction<T>(
    work: (transaction: VocabularyAdminTransaction) => Promise<T>,
  ): Promise<T>;
}

/** DB 제약과 동시 상태 변경을 domain이 안정적으로 해석할 저장 오류 */
export class VocabularyAdminRepositoryError extends Error {
  constructor(
    readonly code:
      | 'VOCABULARY_DUPLICATE'
      | 'VOCABULARY_IN_USE'
      | 'VOCABULARY_PERSISTENCE_CONFLICT'
      | 'MEANING_RELATION_DUPLICATE'
      | 'MEANING_RELATION_NOT_FOUND'
      | 'VOCABULARY_MERGE_CONFLICT'
      | 'VOCABULARY_NOT_FOUND',
    readonly operation: string,
  ) {
    super(`${code}:${operation}`);
    this.name = 'VocabularyAdminRepositoryError';
  }
}

export type {
  VocabularyMeaningOwner,
  VocabularyMergeMovedCounts,
  VocabularyMergeStoredResult,
  VocabularyRelationsMergeRelationWrite,
  VocabularyRelationsMergeRepository,
  VocabularyRelationsMergeStoredRelation,
} from './vocabulary-relations-merge.repository.js';
export { VocabularyRelationsMergeRepositoryError } from './vocabulary-relations-merge.repository.js';
