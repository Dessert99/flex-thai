/** 관리자 오류 신고 목록과 소유 콘텐츠 deep-link를 렌더링한다 */
import type { AdminContentErrorReportListResponse } from '@flex-thia/contracts';
import { toContentErrorReportTargetLink } from '../model/contentErrorReportTargetLink';

/** 관리자 오류 신고 목록 화면 */
export function ContentErrorReportManagementPageView({
  reports,
}: {
  reports: AdminContentErrorReportListResponse;
}) {
  if (reports.items.length === 0) return <p>접수된 오류 신고가 없습니다.</p>;
  return (
    <section aria-labelledby='content-error-report-title'>
      <h1 id='content-error-report-title'>콘텐츠 오류 신고</h1>
      <ul>
        {reports.items.map((report) => {
          const href = toContentErrorReportTargetLink({
            kind: report.targetKind,
            contentId: report.canonicalReference.contentId,
          });
          return (
            <li key={report.id}>
              <strong>{report.snapshot.title}</strong>
              <span>{report.status}</span>
              {href ? (
                <a href={href}>대상 콘텐츠 열기</a>
              ) : (
                <span>통합 대기</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
