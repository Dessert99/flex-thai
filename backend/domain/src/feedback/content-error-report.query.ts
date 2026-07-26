/** 관리자 콘텐츠 오류 신고 read model port를 정의한다 */
import type {
  ContentErrorReportCategory,
  ContentErrorReportStatus,
  ContentErrorReportTargetKind,
} from './content-error-report.js';
import type { ContentErrorReport } from './content-error-report.repository.js';

/** append-only 처리 이력 */
export interface ContentErrorReportHistoryEntry {
  id: string;
  action: 'SUBMITTED' | 'STATUS_CHANGED' | 'ASSIGNEE_CHANGED';
  actorUserId: string;
  actorEmail: string;
  fromStatus: ContentErrorReportStatus | null;
  toStatus: ContentErrorReportStatus | null;
  fromAssigneeUserId: string | null;
  toAssigneeUserId: string | null;
  createdAt: Date;
}

/** 관리자 목록에 필요한 사용자 표시 정보 */
export interface ContentErrorReportUserSummary {
  id: string;
  email: string;
}

/** 관리자 목록의 신고와 사용자 projection */
export interface AdminContentErrorReportListItem extends ContentErrorReport {
  reporter: ContentErrorReportUserSummary;
  assignee: ContentErrorReportUserSummary | null;
}

/** 관리자 목록 필터 */
export interface AdminContentErrorReportListQuery {
  status?: ContentErrorReportStatus;
  targetKind?: ContentErrorReportTargetKind;
  category?: ContentErrorReportCategory;
  assigneeUserId?: string;
  page: number;
  pageSize: number;
}
/** 관리자 목록 page */
export interface ContentErrorReportPage {
  items: AdminContentErrorReportListItem[];
  totalItems: number;
}
/** 관리자 상세 read model */
export interface ContentErrorReportDetail {
  report: ContentErrorReport;
  reporter: ContentErrorReportUserSummary;
  assignee: ContentErrorReportUserSummary | null;
  history: readonly ContentErrorReportHistoryEntry[];
}
/** 관리자 오류 신고 조회 port */
export interface ContentErrorReportQuery {
  list(
    query: AdminContentErrorReportListQuery,
  ): Promise<ContentErrorReportPage>;
  findById(reportId: string): Promise<ContentErrorReportDetail | null>;
}
