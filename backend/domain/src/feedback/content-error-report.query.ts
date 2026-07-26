/** 관리자 콘텐츠 오류 신고 read model port를 정의한다 */
import type {
  ContentErrorReportCategory,
  ContentErrorReportStatus,
  ContentErrorReportTargetKind,
} from './content-error-report.js';
import type { ContentErrorReport } from './content-error-report.repository.js';

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
  items: ContentErrorReport[];
  totalItems: number;
}
/** 관리자 상세 read model */
export interface ContentErrorReportDetail {
  report: ContentErrorReport;
  history: readonly Record<string, unknown>[];
}
/** 관리자 오류 신고 조회 port */
export interface ContentErrorReportQuery {
  list(
    query: AdminContentErrorReportListQuery,
  ): Promise<ContentErrorReportPage>;
  findById(reportId: string): Promise<ContentErrorReportDetail | null>;
}
