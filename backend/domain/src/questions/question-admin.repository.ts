/** 관리자 문제 초안 복제·교체의 current 조회와 원자 저장 port를 정의한다 */
import type {
  ResolvedQuestionBlock,
  ResolvedQuestionOption,
  ResolvedQuestionSentenceGraph,
  VocabularyMeaningReferenceRecord,
  VocabularyPronunciationReferenceRecord,
  VocabularyReferenceRecord,
} from '../content-import/content-draft.repository.js';
import type { MediaAsset } from '../media/media-asset.js';
import type {
  QuestionRecord,
  QuestionVersionRecord,
} from './question-publication.repository.js';
import type {
  QuestionBlockKind,
  QuestionDisplayMode,
  QuestionTemplate,
} from './question-version.js';

/** 복제 원본의 sentence version 참조와 정답을 포함한 문제 버전 */
export interface QuestionAdminVersionSource extends QuestionVersionRecord {
  typeVersionId: string;
  topicId: string;
  tagIds: string[];
  difficulty: number;
  blocks: Array<{
    kind: QuestionBlockKind;
    displayMode: QuestionDisplayMode;
    position: number;
    sentences: Array<{
      sentenceVersionId: string;
      position: number;
      speaker: string | null;
    }>;
  }>;
  options: Array<{
    sentenceVersionId: string | null;
    position: number;
    isCorrect: boolean;
    spanSentenceVersionId: string | null;
    spanStartTokenIndex: number | null;
    spanEndTokenIndex: number | null;
  }>;
}

/** 관리자 문제 교체가 참조할 유형 버전의 current 식별 정보 */
export interface QuestionAdminTypeVersion {
  id: string;
  slug: string;
  version: number;
  template: QuestionTemplate;
  optionCount: number;
}

/** 새 생성 또는 전체 교체할 문제 버전 graph */
export interface QuestionAdminVersionGraph {
  version: {
    id: string;
    questionId: string;
    version: number;
    typeVersionId: string;
    topicId: string;
    difficulty: number;
    status: 'DRAFT';
    validationStatus: 'PENDING';
    validationIssues: [];
    validatedAt: null;
    publishedAt: null;
  };
  tagIds: string[];
  sentences: ResolvedQuestionSentenceGraph[];
  blocks: ResolvedQuestionBlock[];
  options: ResolvedQuestionOption[];
}

/** 관리자 문제 변경과 같은 transaction에 append할 감사 입력 */
export interface QuestionAdminAuditInput {
  actorSub: string;
  actorUserId: string;
  action: 'QUESTION_VERSION_CLONED' | 'QUESTION_VERSION_REPLACED';
  targetType: 'QUESTION_VERSION';
  targetId: string;
  summary: Record<string, unknown>;
  requestId: string;
  occurredAt: Date;
}

/** 한 PostgreSQL transaction 안에서만 사용하는 관리자 문제 저장 연산 */
export interface QuestionAdminTransaction {
  loadQuestion(questionId: string): Promise<QuestionRecord | null>;
  loadLatestVersion(
    questionId: string,
  ): Promise<QuestionAdminVersionSource | null>;
  loadVersionSource(
    versionId: string,
  ): Promise<QuestionAdminVersionSource | null>;
  findQuestionTypeVersion(
    slug: string,
    version: number,
  ): Promise<QuestionAdminTypeVersion | null>;
  findActiveQuestionTopic(slug: string): Promise<{ id: string } | null>;
  findActiveQuestionTags(slugs: string[]): Promise<Array<{ id: string }>>;
  findMediaAssetById(mediaAssetId: string): Promise<MediaAsset | null>;
  findVocabularyById(
    vocabularyId: string,
  ): Promise<VocabularyReferenceRecord | null>;
  findVocabularyMeaningById(
    meaningId: string,
  ): Promise<VocabularyMeaningReferenceRecord | null>;
  findVocabularyPronunciationById(
    pronunciationId: string,
  ): Promise<VocabularyPronunciationReferenceRecord | null>;
  createVersion(graph: QuestionAdminVersionGraph): Promise<void>;
  replaceVersion(graph: QuestionAdminVersionGraph): Promise<void>;
  appendAuditLog(input: QuestionAdminAuditInput): Promise<void>;
}

/** local PostgreSQL과 Data API가 같은 관리자 문제 transaction을 실행하게 한다 */
export interface QuestionAdminRepository {
  runInTransaction<T>(
    work: (transaction: QuestionAdminTransaction) => Promise<T>,
  ): Promise<T>;
}
