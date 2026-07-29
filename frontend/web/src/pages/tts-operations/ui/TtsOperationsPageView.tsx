/** 관리자 TTS 작업 page의 loading·error·empty·목록 상태를 표현한다 */
import type { TtsJobListResponse } from '@flex-thia/contracts';
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
  hasTtsOperationsFilters,
  type TtsOperationsSearch,
} from '../model/ttsOperationsSearch';
import { TtsOperationsFilters } from './TtsOperationsFilters';

interface TtsOperationsPageViewProps {
  data: TtsJobListResponse | undefined;
  error: unknown;
  loading: boolean;
  onFilterChange: (patch: Partial<TtsOperationsSearch>) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  search: TtsOperationsSearch;
}

/** 같은 작업 page를 desktop table과 mobile record로 제공한다 */
export function TtsOperationsPageView({
  data,
  error,
  loading,
  onFilterChange,
  onPageChange,
  onResetFilters,
  onRetry,
  search,
}: TtsOperationsPageViewProps) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title'>TTS 운영</h1>
      <TtsOperationsFilters
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
}: Omit<TtsOperationsPageViewProps, 'onFilterChange'>) {
  if (loading) {
    return <PageLoading message='TTS 작업을 불러오고 있습니다.' />;
  }
  if (error !== null || data === undefined) {
    return (
      <PageError
        message='TTS 작업을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (data.items.length === 0) {
    const filtered = hasTtsOperationsFilters(search);
    return (
      <PageEmpty
        action={
          filtered ? (
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
          filtered
            ? '기간이나 상태 조건을 변경해 보세요.'
            : 'TTS 생성 작업이 접수되면 이곳에 표시됩니다.'
        }
        title={
          filtered
            ? '조건에 맞는 TTS 작업이 없습니다.'
            : '등록된 TTS 작업이 없습니다.'
        }
      />
    );
  }
  return (
    <>
      <TtsJobRecords data={data} />
      <TtsOperationsPagination
        onPageChange={onPageChange}
        page={data.page}
      />
    </>
  );
}

function TtsJobRecords({ data }: { data: TtsJobListResponse }) {
  return (
    <>
      <div className='hidden md:block'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>상태</TableHead>
              <TableHead>항목</TableHead>
              <TableHead>생성</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <JobStatus status={job.status} />
                </TableCell>
                <TableCell>
                  {job.counts.succeeded} 성공 / {job.counts.failed} 실패
                </TableCell>
                <TableCell>
                  <a href={`/admin/tts/jobs/${job.id}`}>{job.createdAt}</a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul
        aria-label='모바일 TTS 작업 목록'
        className='grid gap-cluster md:hidden'
      >
        {data.items.map((job) => (
          <li key={job.id}>
            <a href={`/admin/tts/jobs/${job.id}`}>
              <JobStatus status={job.status} />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function TtsOperationsPagination({
  onPageChange,
  page,
}: {
  onPageChange: (page: number) => void;
  page: TtsJobListResponse['page'];
}) {
  return (
    <nav
      aria-label='TTS 작업 목록 페이지'
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

function JobStatus({
  status,
}: {
  status: TtsJobListResponse['items'][number]['status'];
}) {
  return (
    <Badge variant={status === 'FAILED' ? 'destructive' : 'secondary'}>
      {
        (
          {
            QUEUED: '대기',
            RUNNING: '실행 중',
            SUCCEEDED: '성공',
            PARTIALLY_FAILED: '일부 실패',
            FAILED: '실패',
          } as const
        )[status]
      }
    </Badge>
  );
}
