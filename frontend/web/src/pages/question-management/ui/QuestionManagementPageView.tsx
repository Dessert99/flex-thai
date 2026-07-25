/** 관리자 문제 record를 desktop table과 mobile stack으로 표현한다 */
import type { AdminQuestionListResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import {
  hasAdminQuestionFilters,
  type AdminQuestionSearch,
} from '../model/adminQuestionSearch';
import { AdminQuestionFilters } from './AdminQuestionFilters';

interface QuestionManagementPageViewProps {
  data: AdminQuestionListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: Partial<AdminQuestionSearch>) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  search: AdminQuestionSearch;
}

type QuestionRecord = AdminQuestionListResponse['items'][number];

/** 동일 record 배열을 두 breakpoint 표현에 공급해 상태 해석을 공유한다 */
export function QuestionManagementPageView({
  data,
  error,
  loading,
  onFilterChange,
  onPageChange,
  onResetFilters,
  onRetry,
  search,
}: QuestionManagementPageViewProps) {
  return (
    <section className='grid gap-section'>
      <header className='space-y-cluster'>
        <h1 className='text-title text-primary'>문제 관리</h1>
        <p className='text-body text-subtle'>
          문제와 최신 버전의 공개 상태를 확인하세요.
        </p>
      </header>
      <AdminQuestionFilters
        onChange={onFilterChange}
        onReset={onResetFilters}
        search={search}
      />
      {renderListState({
        data,
        error,
        loading,
        onPageChange,
        onResetFilters,
        onRetry,
        search,
      })}
    </section>
  );
}

function renderListState({
  data,
  error,
  loading,
  onPageChange,
  onResetFilters,
  onRetry,
  search,
}: Omit<QuestionManagementPageViewProps, 'onFilterChange'>) {
  if (loading) {
    return <PageLoading message='관리 문제를 불러오고 있습니다.' />;
  }
  if (error || data === undefined) {
    return (
      <PageError
        message='관리 문제 목록을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (data.items.length === 0) {
    return (
      <PageEmpty
        action={
          hasAdminQuestionFilters(search) ? (
            <Button
              onClick={onResetFilters}
              type='button'
              variant='outline'
            >
              필터 초기화
            </Button>
          ) : undefined
        }
        description={
          hasAdminQuestionFilters(search)
            ? '다른 조건을 선택하거나 필터를 초기화해 보세요.'
            : '콘텐츠 가져오기로 문제 초안을 등록할 수 있습니다.'
        }
        title={
          hasAdminQuestionFilters(search)
            ? '조건에 맞는 문제가 없습니다.'
            : '등록된 문제가 없습니다.'
        }
      />
    );
  }

  return (
    <>
      <DesktopQuestionTable records={data.items} />
      <MobileQuestionRecords records={data.items} />
      <QuestionPagination
        onPageChange={onPageChange}
        page={data.page}
      />
    </>
  );
}

function DesktopQuestionTable({ records }: { records: QuestionRecord[] }) {
  return (
    <div className='hidden md:block'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>문제 유형</TableHead>
            <TableHead>문제 상태</TableHead>
            <TableHead>최신 버전</TableHead>
            <TableHead>검증</TableHead>
            <TableHead>난이도</TableHead>
            <TableHead>수정 시각</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.questionId}>
              <TableCell>
                <QuestionLink record={record} />
              </TableCell>
              <TableCell>
                <QuestionStatusBadge status={record.status} />
              </TableCell>
              <TableCell>
                v{record.latestVersion} ·{' '}
                {toVersionStatus(record.latestVersionStatus)}
              </TableCell>
              <TableCell>
                <ValidationStatusBadge status={record.validationStatus} />
              </TableCell>
              <TableCell>{record.difficulty}</TableCell>
              <TableCell>
                {new Date(record.updatedAt).toLocaleString('ko-KR')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileQuestionRecords({ records }: { records: QuestionRecord[] }) {
  return (
    <ul
      aria-label='모바일 문제 목록'
      className='grid gap-cluster md:hidden'
    >
      {records.map((record) => (
        <li
          className='grid gap-cluster rounded-panel border border-default bg-surface p-page'
          key={record.questionId}
        >
          <QuestionLink record={record} />
          <div className='flex flex-wrap gap-cluster'>
            <QuestionStatusBadge status={record.status} />
            <ValidationStatusBadge status={record.validationStatus} />
          </div>
          <p className='text-caption text-subtle'>
            최신 v{record.latestVersion} · 난이도 {record.difficulty}
          </p>
        </li>
      ))}
    </ul>
  );
}

function QuestionLink({ record }: { record: QuestionRecord }) {
  return (
    <a
      className='text-primary underline'
      href={`/admin/questions/${record.questionId}`}
    >
      {record.questionTypeSlug}
    </a>
  );
}

function QuestionStatusBadge({ status }: { status: QuestionRecord['status'] }) {
  return (
    <Badge variant={toQuestionBadgeVariant(status)}>
      {{ DRAFT: '초안', HIDDEN: '숨김', PUBLISHED: '게시' }[status]}
    </Badge>
  );
}

function ValidationStatusBadge({
  status,
}: {
  status: QuestionRecord['validationStatus'];
}) {
  return (
    <Badge variant={toValidationBadgeVariant(status)}>
      {
        { FAILED: '검증 실패', PASSED: '검증 통과', PENDING: '검증 대기' }[
          status
        ]
      }
    </Badge>
  );
}

function toQuestionBadgeVariant(status: QuestionRecord['status']) {
  if (status === 'HIDDEN') return 'destructive' as const;
  if (status === 'PUBLISHED') return 'secondary' as const;
  return 'outline' as const;
}

function toValidationBadgeVariant(status: QuestionRecord['validationStatus']) {
  if (status === 'FAILED') return 'destructive' as const;
  if (status === 'PASSED') return 'secondary' as const;
  return 'outline' as const;
}

function QuestionPagination({
  onPageChange,
  page,
}: {
  onPageChange: (page: number) => void;
  page: AdminQuestionListResponse['page'];
}) {
  return (
    <nav
      aria-label='관리자 문제 목록 페이지'
      className='flex items-center justify-between gap-cluster'
    >
      <Button
        disabled={page.page <= 1}
        onClick={() => onPageChange(page.page - 1)}
        type='button'
        variant='outline'
      >
        이전
      </Button>
      <span className='text-body text-subtle'>
        {page.page} / {page.totalPages}
      </span>
      <Button
        disabled={page.page >= page.totalPages}
        onClick={() => onPageChange(page.page + 1)}
        type='button'
        variant='outline'
      >
        다음
      </Button>
    </nav>
  );
}

function toVersionStatus(status: QuestionRecord['latestVersionStatus']) {
  return {
    DRAFT: '초안',
    INVALIDATED: '무효화',
    PUBLISHED: '게시',
    RETIRED: '폐기',
  }[status];
}
