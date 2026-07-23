/** 답안 멱등성과 append-only 저장을 한 transaction으로 실행하는 port를 정의한다 */

/** 제출 당시 사실을 이후 콘텐츠 상태와 무관하게 보존하는 원시 답안이다 */
export interface QuestionAttemptRecord {
  id: string;
  userId: string;
  questionId: string;
  questionVersionId: string;
  attemptNo: number;
  selectedOptionId: string;
  clientAttemptId: string;
  durationMs: number;
  isCorrect: boolean;
  submittedAt: Date;
}

/** 원시 답안 insert에 필요한 전체 append-only column이다 */
export type InsertQuestionAttemptInput = QuestionAttemptRecord;

/** 새 제출의 문제·버전·선택지 가용성을 한 DB snapshot으로 판정할 값이다 */
export interface QuestionAttemptSubmissionTarget {
  questionStatus: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  currentPublishedVersionId: string | null;
  questionVersionStatus:
    'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'INVALIDATED' | null;
  selectedOptionId: string | null;
  correctOptionId: string | null;
}

/** 사용자 row lock 뒤 답안 멱등 확인과 append만 허용하는 transaction 계약이다 */
export interface QuestionAttemptTransaction {
  findByClientAttemptId(
    userId: string,
    clientAttemptId: string,
  ): Promise<QuestionAttemptRecord | null>;
  loadSubmissionTarget(
    questionId: string,
    questionVersionId: string,
    selectedOptionId: string,
  ): Promise<QuestionAttemptSubmissionTarget | null>;
  readNextAttemptNo(userId: string, questionId: string): Promise<number>;
  insertAttempt(input: InsertQuestionAttemptInput): Promise<void>;
  loadCorrectOptionId(questionVersionId: string): Promise<string>;
}

/** 한 사용자의 답안 번호와 client ID 판정을 직렬화하는 저장소 port다 */
export interface QuestionAttemptRepository {
  runInTransaction<T>(
    userId: string,
    work: (transaction: QuestionAttemptTransaction) => Promise<T>,
  ): Promise<T>;
}
