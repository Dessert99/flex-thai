/** 문제 게시 use case가 원자적으로 실행할 저장소 transaction 계약을 정의한다 */
import type {
  QuestionValidationReport,
  QuestionVersionValidationCandidate,
} from './question-version.js';

/** 논리 문제의 노출 상태와 현재 게시 버전을 보존한다 */
export interface QuestionRecord {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  currentPublishedVersionId: string | null;
}

/** 불변 문제 버전의 수명과 최신 검증 결과를 보존한다 */
export interface QuestionVersionRecord {
  id: string;
  questionId: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'INVALIDATED';
  validationStatus: 'PENDING' | 'PASSED' | 'FAILED';
  publishedAt: Date | null;
}

/** 한 PostgreSQL transaction 안에서만 사용할 문제 게시 저장 연산을 정의한다 */
export interface QuestionPublicationTransaction {
  loadQuestion(questionId: string): Promise<QuestionRecord | null>;
  loadVersion(versionId: string): Promise<QuestionVersionRecord | null>;
  loadValidationCandidate(
    versionId: string,
  ): Promise<QuestionVersionValidationCandidate | null>;
  saveValidation(
    versionId: string,
    report: QuestionValidationReport,
    validatedAt: Date,
  ): Promise<void>;
  retireVersion(versionId: string, questionId: string): Promise<void>;
  publishVersion(versionId: string, publishedAt: Date): Promise<void>;
  setCurrentPublishedVersion(
    questionId: string,
    versionId: string,
  ): Promise<void>;
  freezeReferencedSentences(versionId: string, frozenAt: Date): Promise<void>;
  invalidateVersion(versionId: string): Promise<void>;
  hideQuestion(questionId: string): Promise<void>;
  restoreQuestion(questionId: string): Promise<void>;
  appendAuditLog(input: {
    actorSub: string;
    actorUserId: string;
    action: string;
    targetType: 'QUESTION' | 'QUESTION_VERSION';
    targetId: string;
    summary: Record<string, unknown>;
    requestId: string;
    occurredAt: Date;
  }): Promise<void>;
}

/** 로컬 PostgreSQL과 Data API가 같은 transaction use case를 실행하게 한다 */
export interface QuestionPublicationRepository {
  runInTransaction<T>(
    work: (transaction: QuestionPublicationTransaction) => Promise<T>,
  ): Promise<T>;
}
