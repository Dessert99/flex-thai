/** 동기 콘텐츠 가져오기의 멱등 요청·항목 결과·완료 transaction port를 정의한다 */
import type { ContentDraftAuditContext } from './content-import.js';

/** 완료된 콘텐츠 가져오기의 공개 가능한 최종 상태 */
export type ContentImportFinalStatus = 'COMPLETED' | 'COMPLETED_WITH_FAILURES';

/** 항목 거절 시 원문 없이 보존할 안정 오류 */
export interface ContentImportItemError {
  path: string;
  code: string;
}

/** 멱등 판정에만 쓰고 공개 projection에는 전달하지 않는 import record */
export interface ContentImportRecord {
  id: string;
  requestedBy: string;
  idempotencyKey: string;
  requestHash: string;
  status: ContentImportFinalStatus | null;
  vocabularyCount: number;
  questionCount: number;
  importedCount: number;
  rejectedCount: number;
  createdAt: Date;
  completedAt: Date | null;
}

interface ContentImportStoredItemBase {
  kind: 'VOCABULARY' | 'QUESTION';
  sourceIndex: number;
  clientRef: string;
}

/** referenceMap과 내부 row ID를 제외한 저장 item 결과 */
export type ContentImportStoredItem =
  | (ContentImportStoredItemBase & {
      status: 'IMPORTED';
      targetId: string;
      errors: [];
    })
  | (ContentImportStoredItemBase & {
      status: 'REJECTED';
      targetId: null;
      errors: ContentImportItemError[];
    });

/** clientRef와 referenceMap 없이 공개할 항목별 처리 결과 */
export type ContentImportResultItem =
  | Omit<Extract<ContentImportStoredItem, { status: 'IMPORTED' }>, 'clientRef'>
  | Omit<Extract<ContentImportStoredItem, { status: 'REJECTED' }>, 'clientRef'>;

/** requester·hash·referenceMap·원본 요청을 제외한 동기 import 결과 */
export interface ContentImportDetail {
  id: string;
  status: ContentImportFinalStatus;
  vocabularyCount: number;
  questionCount: number;
  importedCount: number;
  rejectedCount: number;
  createdAt: Date;
  completedAt: Date;
  items: ContentImportResultItem[];
}

/** user/key unique row를 생성하거나 기존 row를 읽을 입력 */
export interface ClaimContentImportInput {
  id: string;
  requestedBy: string;
  idempotencyKey: string;
  requestHash: string;
  vocabularyCount: number;
  questionCount: number;
  createdAt: Date;
}

/** 예상 가능한 draft 오류 하나를 독립 transaction으로 저장할 입력 */
export interface SaveRejectedContentImportItemInput {
  importId: string;
  kind: ContentImportStoredItem['kind'];
  sourceIndex: number;
  clientRef: string;
  errors: ContentImportItemError[];
}

/** unique item 집계와 최초 완료 audit을 원자 처리할 입력 */
export interface CompleteContentImportInput {
  importId: string;
  completedAt: Date;
  context: ContentDraftAuditContext;
}

/** local PostgreSQL과 Data API가 공유하는 콘텐츠 가져오기 영속 port */
export interface ContentImportRepository {
  claim(
    this: void,
    input: ClaimContentImportInput,
  ): Promise<ContentImportRecord>;
  findItem(
    this: void,
    importId: string,
    kind: ContentImportStoredItem['kind'],
    sourceIndex: number,
  ): Promise<ContentImportStoredItem | null>;
  saveRejectedItem(
    this: void,
    input: SaveRejectedContentImportItemInput,
  ): Promise<ContentImportStoredItem>;
  complete(this: void, input: CompleteContentImportInput): Promise<void>;
  findDetail(this: void, importId: string): Promise<ContentImportDetail | null>;
}
