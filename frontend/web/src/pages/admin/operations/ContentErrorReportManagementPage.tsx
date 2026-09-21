import { useContentErrorReportManagement } from '@/features/operations/hooks/content-error-report-management/useContentErrorReportManagement';
import type { ContentErrorReportSearch } from '@/features/operations/libs/content-error-report-management/contentErrorReportSearch';
import { toContentErrorReportTargetLink } from '@/features/operations/libs/content-error-report-management/contentErrorReportTargetLink';
import { Container } from '@/shared/components/layouts/Container';
import type { ContentErrorReportStatus } from '@flex-thia/contracts/feedback/content-error-reports';
import { Link } from '@tanstack/react-router';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

// eslint-disable-next-line complexity -- 목록 상태와 선택 상세의 기존 표시 분기를 페이지에서 조립한다.
export function ContentErrorReportManagementPage(
  pageInput: Parameters<typeof useContentErrorReportManagement>[0],
) {
  const {
    reports,
    detail,
    search,
    loading,
    detailLoading,
    error,
    detailError,
    mutationError,
    mutating,
    onSearchChange,
    onSelect,
    onStatusChange,
    onAssign,
    onUnassign,
  } = useContentErrorReportManagement(pageInput);

  if (loading)
    return (
      <Container className='max-w-content flex-1'>
        <p role='status'>오류 신고를 불러오는 중입니다.</p>
      </Container>
    );

  if (error)
    return (
      <Container className='max-w-content flex-1'>
        <p role='alert'>오류 신고를 불러오지 못했습니다.</p>
      </Container>
    );

  const targetLink = detail
    ? toContentErrorReportTargetLink({
        kind: detail.targetKind,
        contentId: detail.canonicalReference.contentId,
      })
    : null;

  return (
    <Container className='max-w-content flex-1'>
      <section>
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
        <label>
          대상
          <select
            value={search.targetKind ?? ''}
            onChange={(event) =>
              onSearchChange(
                changeFilter(search, 'targetKind', event.target.value),
              )
            }
          >
            <option value=''>전체</option>
            {['VOCABULARY', 'SENTENCE'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          분류
          <select
            value={search.category ?? ''}
            onChange={(event) =>
              onSearchChange(
                changeFilter(search, 'category', event.target.value),
              )
            }
          >
            <option value=''>전체</option>
            {[
              'MEANING_TRANSLATION',
              'ANSWER_EXPLANATION',
              'TOKENIZATION',
              'OTHER',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get(
              'assigneeFilter',
            );
            if (typeof value === 'string')
              onSearchChange(changeFilter(search, 'assigneeUserId', value));
          }}
        >
          <label>
            담당자 ID
            <input
              name='assigneeFilter'
              pattern='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'
              defaultValue={search.assigneeUserId}
            />
          </label>
          <button type='submit'>필터 적용</button>
        </form>
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
        {reports && reports.page.totalPages > 0 ? (
          <nav aria-label='페이지 이동'>
            <button
              disabled={search.page <= 1}
              onClick={() =>
                onSearchChange({ ...search, page: search.page - 1 })
              }
              type='button'
            >
              이전
            </button>
            <span>
              {search.page} / {reports.page.totalPages}
            </span>
            <button
              disabled={search.page >= reports.page.totalPages}
              onClick={() =>
                onSearchChange({ ...search, page: search.page + 1 })
              }
              type='button'
            >
              다음
            </button>
          </nav>
        ) : null}
        {detailLoading ? <p role='status'>상세를 불러오는 중입니다.</p> : null}
        {detailError ? (
          <p role='alert'>신고 상세를 불러오지 못했습니다.</p>
        ) : null}
        {detail ? (
          <section aria-label='신고 상세'>
            <h2>{detail.snapshot.title}</h2>
            <p>{detail.snapshot.primaryText}</p>
            <p>{detail.snapshot.secondaryText}</p>
            <p>
              {detail.snapshot.versionLabel} · {detail.snapshot.locationLabel}
            </p>
            <p>{detail.description ?? '추가 설명 없음'}</p>
            <p>신고자 {detail.reporter.email}</p>
            <p>담당자 {detail.assignee?.email ?? '미배정'}</p>
            <pre>{JSON.stringify(detail.canonicalReference, null, 2)}</pre>
            {mutationError ? (
              <p role='alert'>변경을 저장하지 못했습니다.</p>
            ) : null}
            {targetLink ? (
              <Link {...targetLink}>대상 콘텐츠 열기</Link>
            ) : (
              <span>통합 대기</span>
            )}
            <h3>처리 이력</h3>
            <ol>
              {detail.history.map((entry) => (
                <li key={entry.id}>
                  {entry.action} · {entry.actor.email} ·{' '}
                  {entry.fromStatus ?? '-'} → {entry.toStatus ?? '-'} ·{' '}
                  {entry.fromAssigneeUserId ?? '-'} →{' '}
                  {entry.toAssigneeUserId ?? '-'} · {entry.createdAt}
                </li>
              ))}
            </ol>
            <div>
              {transitions[detail.status].map((status) => (
                <button
                  key={status}
                  disabled={mutating}
                  onClick={() => {
                    if (!mutating) onStatusChange(status);
                  }}
                  type='button'
                >
                  {status}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (mutating) return;
                const data = new FormData(event.currentTarget);
                const assignee = data.get('assigneeUserId');
                if (typeof assignee === 'string' && assignee)
                  onAssign(assignee);
              }}
            >
              <fieldset disabled={mutating}>
                <label>
                  담당자 ID
                  <input
                    key={detail.assignee?.id ?? 'unassigned'}
                    name='assigneeUserId'
                    pattern='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'
                    required
                    defaultValue={detail.assignee?.id}
                  />
                </label>
                <button type='submit'>
                  {detail.assignee ? '담당자 교체' : '담당자 배정'}
                </button>
                {detail.assignee ? (
                  <button
                    onClick={() => {
                      if (!mutating) onUnassign();
                    }}
                    type='button'
                  >
                    담당자 해제
                  </button>
                ) : null}
              </fieldset>
            </form>
          </section>
        ) : null}
      </section>
    </Container>
  );
}

const transitions: Record<
  ContentErrorReportStatus,
  ContentErrorReportStatus[]
> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'REJECTED'],
  RESOLVED: ['OPEN'],
  REJECTED: ['OPEN'],
};

const changeFilter = (
  search: ContentErrorReportSearch,
  key: 'targetKind' | 'category' | 'assigneeUserId',
  value: string,
): ContentErrorReportSearch => {
  const next = { ...search };
  delete next[key];
  if (value) Object.assign(next, { [key]: value });
  return { ...next, page: 1 };
};
