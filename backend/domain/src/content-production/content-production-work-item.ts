/** 콘텐츠 제작 claim을 exact 입력 snapshot과 연결하는 worker 계약 */
import type {
  ContentProductionInput,
  ContentProductionItem,
  ContentProductionPresetSnapshot,
  ContentProductionPurpose,
} from './content-production.service.js';

/** 콘텐츠 제작 항목이 실행할 세부 작업 */
export type ContentProductionOperation =
  | 'VOCABULARY_EXTRACTION'
  | 'QUESTION_GENERATION';

/** 문자열 sourceRef와 별개로 항목의 입력·작업을 고정하는 seed */
export interface ContentProductionItemSeed {
  sourceRef: string;
  jobInputId: string;
  operation: ContentProductionOperation;
}

/** worker가 항목 처리에 필요한 job snapshot */
export interface ContentProductionWorkerJob {
  id: string;
  attempt: number;
  requestedBy: string;
  purpose: ContentProductionPurpose;
  presetSnapshot: ContentProductionPresetSnapshot;
  inputs: Array<
    ContentProductionInput & {
      jobInputId: string;
      ordinal: number;
    }
  >;
}

/** processor가 sourceRef 해석 없이 소비하는 구조화된 입력 */
export interface ContentProductionWorkItem {
  jobId: string;
  jobAttempt: number;
  requestedBy: string;
  purpose: ContentProductionPurpose;
  presetSnapshot: ContentProductionPresetSnapshot;
  item: ContentProductionItem & {
    jobInputId: string;
    operation: ContentProductionOperation;
    leaseUntil: Date;
    leaseToken: string;
  };
  input: ContentProductionInput & {
    jobInputId: string;
    ordinal: number;
  };
}

/** claim 항목을 같은 job input과 연결하고 불완전 snapshot을 즉시 거절한다 */
export const createContentProductionWorkItem = (
  job: ContentProductionWorkerJob,
  item: ContentProductionWorkItem['item'],
): ContentProductionWorkItem => {
  const input = job.inputs.find(
    (candidate) => candidate.jobInputId === item.jobInputId,
  );

  if (!input) {
    throw new Error(`콘텐츠 제작 항목의 입력을 찾을 수 없습니다: ${item.id}`);
  }

  return {
    jobId: job.id,
    jobAttempt: job.attempt,
    requestedBy: job.requestedBy,
    purpose: job.purpose,
    presetSnapshot: job.presetSnapshot,
    item,
    input,
  };
};
