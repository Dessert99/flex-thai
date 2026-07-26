/** 콘텐츠 오류 신고 target 해석과 원자 workflow 저장 port를 정의한다 */
import type {
  ContentErrorReportCanonicalReference,
  ContentErrorReportCategory,
  ContentErrorReportOrigin,
  ContentErrorReportSnapshot,
  ContentErrorReportStatus,
  ContentErrorReportTargetKind,
} from './content-error-report.js';

/** 저장된 콘텐츠 오류 신고 */
export interface ContentErrorReport {
  id: string;
  reporterUserId: string;
  targetKind: ContentErrorReportTargetKind;
  category: ContentErrorReportCategory;
  status: ContentErrorReportStatus;
  assigneeUserId: string | null;
  description: string | null;
  canonicalReference: ContentErrorReportCanonicalReference;
  snapshot: ContentErrorReportSnapshot;
  createdAt: Date;
  updatedAt: Date;
}
/** 서버가 해석한 immutable 대상 */
export interface ResolvedContentErrorReportTarget {
  reference: ContentErrorReportCanonicalReference;
  snapshot: ContentErrorReportSnapshot;
}
/** 관리자 변경 감사 문맥 */
export interface ContentErrorReportActor {
  userId: string;
  actorSub: string;
  requestId: string;
}
/** 생성 저장 입력 */
export interface CreateContentErrorReportRecord {
  reporterUserId: string;
  category: ContentErrorReportCategory;
  description: string | null;
  target: ResolvedContentErrorReportTarget;
  createdAt: Date;
}
/** 상태 변경 저장 입력 */
export interface ChangeContentErrorReportStatusRecord {
  reportId: string;
  fromStatus: ContentErrorReportStatus;
  toStatus: ContentErrorReportStatus;
  expectedUpdatedAt: Date;
  actor: ContentErrorReportActor;
  changedAt: Date;
}
/** 담당자 변경 저장 입력 */
export interface ChangeContentErrorReportAssigneeRecord {
  reportId: string;
  fromAssigneeUserId: string | null;
  toAssigneeUserId: string | null;
  expectedUpdatedAt: Date;
  actor: ContentErrorReportActor;
  changedAt: Date;
}
/** 대상 origin을 신뢰 가능한 snapshot으로 바꾼다 */
export interface ContentErrorReportTargetResolver {
  resolve(
    origin: ContentErrorReportOrigin,
  ): Promise<ResolvedContentErrorReportTarget | null>;
}
/** ACTIVE ADMIN만 담당자로 선택한다 */
export interface ContentErrorReportAssigneeResolver {
  isAssignable(userId: string): Promise<boolean>;
}
/** 오류 신고 생성과 workflow를 원자 저장한다 */
export interface ContentErrorReportRepository {
  create(input: CreateContentErrorReportRecord): Promise<ContentErrorReport>;
  changeStatus(
    input: ChangeContentErrorReportStatusRecord,
  ): Promise<ContentErrorReport | null>;
  changeAssignee(
    input: ChangeContentErrorReportAssigneeRecord,
  ): Promise<ContentErrorReport | null>;
}
