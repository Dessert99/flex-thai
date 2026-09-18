import { useAuditLogManagement } from '@/features/operations/hooks/audit-log-management/useAuditLogManagement';
import {
  fromAuditDatetimeLocal,
  toAuditDatetimeLocal,
  type AuditLogSearch,
} from '@/features/operations/libs/audit-log-management/auditLogSearch';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/table';
import type { AuditLogDetailResponse } from '@flex-thia/contracts/operations/audit-logs';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

interface AuditFilterProps {
  label: string;
  onChange: (value: string | undefined) => void;
  type?: string;
  value: string | undefined;
}

/** 빈 문자열을 URL에서 제거하는 감사 filter input */
function AuditFilter({
  label,
  onChange,
  type = 'text',
  value,
}: AuditFilterProps) {
  return (
    <Input
      aria-label={label}
      onChange={(event) => onChange(event.target.value || undefined)}
      placeholder={label}
      type={type}
      value={value ?? ''}
    />
  );
}

interface AuditDetailProps {
  detail: AuditLogDetailResponse | undefined;
  error: boolean;
  loading: boolean;
  onClose: () => void;
}

/** 목록을 유지한 채 선택한 감사 상세만 독립 상태로 렌더링한다 */
function AuditDetail({ detail, error, loading, onClose }: AuditDetailProps) {
  return (
    <aside
      aria-label='감사 기록 상세'
      className='grid gap-control rounded-panel border border-default p-section'
    >
      <div className='flex justify-between'>
        <h2 className='text-subtitle'>상세</h2>
        <Button
          onClick={onClose}
          variant='outline'
        >
          닫기
        </Button>
      </div>
      {loading ? <p>상세를 불러오고 있습니다.</p> : null}
      {error ? <p>상세 기록을 찾지 못했지만 목록은 유지됩니다.</p> : null}
      {detail ? (
        <>
          <p>
            <strong>요청 ID</strong> {detail.requestId}
          </p>
          <dl>
            {Object.entries(detail.summary).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{formatSummaryValue(value)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </aside>
  );
}

const hasFilter = (search: AuditLogSearch) =>
  Boolean(
    search.query ||
    search.actorUserId ||
    search.action ||
    search.targetType ||
    search.targetId ||
    search.from ||
    search.to,
  );

const formatSummaryValue = (value: unknown) =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
export function AuditLogManagementPage(
  pageInput: Parameters<typeof useAuditLogManagement>[0],
) {
  const { onSearchChange, search, list, detail, changeFilter } =
    useAuditLogManagement(pageInput);

  if (list.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>
              감사 기록을 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );
  }

  if (list.isError || !list.data) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>감사 기록을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void list.refetch()}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <>
        <section className='grid gap-section'>
          <h1 className='text-title text-primary'>감사 기록</h1>
          <div className='grid gap-control md:grid-cols-3'>
            <AuditFilter
              label='통합 검색'
              onChange={(query) => changeFilter({ query })}
              value={search.query}
            />
            <AuditFilter
              label='행위'
              onChange={(action) => changeFilter({ action })}
              value={search.action}
            />
            <AuditFilter
              label='행위자 사용자 ID'
              onChange={(actorUserId) => changeFilter({ actorUserId })}
              value={search.actorUserId}
            />
            <AuditFilter
              label='대상 유형'
              onChange={(targetType) => changeFilter({ targetType })}
              value={search.targetType}
            />
            <AuditFilter
              label='대상 ID'
              onChange={(targetId) => changeFilter({ targetId })}
              value={search.targetId}
            />
            <AuditFilter
              label='시작 시각'
              onChange={(from) =>
                changeFilter({ from: fromAuditDatetimeLocal(from ?? '') })
              }
              type='datetime-local'
              value={toAuditDatetimeLocal(search.from)}
            />
            <AuditFilter
              label='종료 시각'
              onChange={(to) =>
                changeFilter({ to: fromAuditDatetimeLocal(to ?? '') })
              }
              type='datetime-local'
              value={toAuditDatetimeLocal(search.to)}
            />
          </div>
          {list.data.items.length === 0 ? (
            <p>
              {hasFilter(search)
                ? '조건에 맞는 감사 기록이 없습니다.'
                : '감사 기록이 없습니다.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시각</TableHead>
                  <TableHead>행위자</TableHead>
                  <TableHead>행위</TableHead>
                  <TableHead>대상</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell data-label='시각'>
                      {new Date(item.createdAt).toLocaleString('ko-KR')}
                    </TableCell>
                    <TableCell data-label='행위자'>
                      {item.actor.kind === 'USER'
                        ? item.actor.email
                        : item.actor.label}
                    </TableCell>
                    <TableCell data-label='행위'>{item.action}</TableCell>
                    <TableCell data-label='대상'>
                      <Button
                        onClick={() =>
                          onSearchChange({
                            ...search,
                            selectedAuditId: item.id,
                          })
                        }
                        variant='outline'
                      >
                        {item.targetType && item.targetId
                          ? `${item.targetType}/${item.targetId}`
                          : item.target}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className='flex items-center gap-control'>
            <Button
              disabled={search.page <= 1}
              onClick={() =>
                onSearchChange({ ...search, page: search.page - 1 })
              }
              variant='outline'
            >
              이전
            </Button>
            <span>
              {search.page} / {Math.max(list.data.page.totalPages, 1)}
            </span>
            <Button
              disabled={search.page >= list.data.page.totalPages}
              onClick={() =>
                onSearchChange({ ...search, page: search.page + 1 })
              }
              variant='outline'
            >
              다음
            </Button>
          </div>
          {search.selectedAuditId ? (
            <AuditDetail
              detail={detail.data}
              error={detail.isError}
              loading={detail.isPending}
              onClose={() => {
                const next = { ...search };
                delete next.selectedAuditId;
                onSearchChange(next);
              }}
            />
          ) : null}
        </section>
      </>
    </Container>
  );
}
