/** AWS와 HTTP에 의존하지 않는 비동기 Job aggregate */

/** 지원하는 초기 비동기 작업 */
export type JobType =
  | 'VOCAB_IMPORT'
  | 'VOCABULARY_EXTRACTION'
  | 'QUESTION_GENERATION'
  | 'VOCABULARY_THEN_QUESTION_GENERATION';

/** 지원하는 원본 형식 */
export type InputType = 'TEXT' | 'PDF' | 'IMAGE';

/** Job 전체 진행 상태 */
export type JobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FAILURES'
  | 'FAILED'
  | 'CANCELLED';

/** 비동기 작업의 최소 영속 상태 */
export interface Job {
  id: string;
  requestedBy: string;
  clientRequestId: string;
  type: JobType;
  inputs: Array<{
    uploadId: string;
    inputType: InputType;
    inputKey: string;
    sizeBytes: number;
  }>;
  status: JobStatus;
  attempt: number;
  enqueuedAt: Date | null;
  createdAt: Date;
}

/** 같은 관리자의 재시도를 합칠 Job 생성 명령 */
export interface CreateJobCommand {
  requestedBy: string;
  clientRequestId: string;
  type: JobType;
  inputs: Array<{
    uploadId: string;
    inputType: InputType;
    inputKey: string;
    sizeBytes: number;
  }>;
}

/** 신규 콘텐츠 제작 경계를 기존 Job 공개 경계에서 호환 노출한다 */
export * from '../content-production/index.js';
