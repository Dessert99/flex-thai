/** 관리자 오류 신고의 filter·목록·상세·workflow 제어를 렌더링한다 */
import type {
  AdminContentErrorReportDetailResponse,
  AdminContentErrorReportListResponse,
  ContentErrorReportStatus,
} from '@flex-thia/contracts';
import type { ContentErrorReportSearch } from '../model/contentErrorReportSearch';
import { toContentErrorReportTargetLink } from '../model/contentErrorReportTargetLink';

/** 관리자 오류 신고 화면의 비동기 상태와 command 입력 */
export interface ContentErrorReportManagementPageViewProps {
  reports: AdminContentErrorReportListResponse | undefined;
  detail: AdminContentErrorReportDetailResponse | undefined;
  search: ContentErrorReportSearch;
  loading: boolean;
  error: boolean;
  mutating: boolean;
  onSearchChange: (search: ContentErrorReportSearch) => void;
  onSelect: (reportId: string) => void;
  onStatusChange: (status: ContentErrorReportStatus) => void;
  onAssign: (assigneeUserId: string) => void;
  onUnassign: () => void;
}

const transitions: Record<
  ContentErrorReportStatus,
  ContentErrorReportStatus[]
> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['OPEN'],
  REJECTED: ['OPEN'],
};

/** 목록 선택과 허용된 workflow command를 한 화면에서 제공한다 */
// 목록·상세 workflow를 한 접근성 문맥에 유지해 조건 분기가 함께 보이게 한다
// eslint-disable-next-line max-lines-per-function, complexity
export function ContentErrorReportManagementPageView({
  reports,
  detail,
  search,
  loading,
  error,
  mutating,
  onSearchChange,
  onSelect,
  onStatusChange,
  onAssign,
  onUnassign,
}: ContentErrorReportManagementPageViewProps) {
  if (loading) return <p role='status'>오류 신고를 불러오는 중입니다.</p>;
  if (error) return <p role='alert'>오류 신고를 불러오지 못했습니다.</p>;
  return (
    <main>
      <h1>콘텐츠 오류 신고</h1>
      <label>
        상태
        <select
          value={search.status ?? ''}
          onChange={(event) => {
            const { status: _status, ...rest } = search;
            void _status;
            const value = event.target.value as ContentErrorReportStatus | '';
            onSearchChange({
              ...rest,
              ...(value ? { status: value } : {}),
              page: 1,
            });
          }}
        >
          <option value=''>전체</option>
          {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] as const).map(
            (status) => (
              <option key={status}>{status}</option>
            ),
          )}
        </select>
      </label>
      {!reports?.items.length ? (
        <p>접수된 오류 신고가 없습니다.</p>
      ) : (
        <ul>
          {reports.items.map((report) => (
            <li key={report.id}>
              <button
                type='button'
                onClick={() => onSelect(report.id)}
              >
                {report.snapshot.title} · {report.status}
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail ? (
        <section aria-label='신고 상세'>
          <h2>{detail.snapshot.title}</h2>
          <p>{detail.snapshot.primaryText}</p>
          <p>{detail.description ?? '추가 설명 없음'}</p>
          {toContentErrorReportTargetLink({
            kind: detail.targetKind,
            contentId: detail.canonicalReference.contentId,
          }) ? (
            <a
              href={
                toContentErrorReportTargetLink({
                  kind: detail.targetKind,
                  contentId: detail.canonicalReference.contentId,
                }) ?? undefined
              }
            >
              대상 콘텐츠 열기
            </a>
          ) : (
            <span>통합 대기</span>
          )}
          <h3>처리 이력</h3>
          <ol>
            {detail.history.map((entry) => (
              <li key={entry.id}>
                {entry.action} · {entry.actor.email}
              </li>
            ))}
          </ol>
          <div>
            {transitions[detail.status].map((status) => (
              <button
                key={status}
                disabled={mutating}
                onClick={() => onStatusChange(status)}
                type='button'
              >
                {status}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const assignee = data.get('assigneeUserId');
              if (typeof assignee === 'string' && assignee) onAssign(assignee);
            }}
          >
            <label>
              담당자 ID
              <input
                name='assigneeUserId'
                defaultValue={detail.assignee?.id}
              />
            </label>
            <button
              disabled={mutating}
              type='submit'
            >
              {detail.assignee ? '담당자 교체' : '담당자 배정'}
            </button>
            {detail.assignee ? (
              <button
                disabled={mutating}
                onClick={onUnassign}
                type='button'
              >
                담당자 해제
              </button>
            ) : null}
          </form>
        </section>
      ) : null}
    </main>
  );
}
