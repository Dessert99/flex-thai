/** 어휘 후보 목록의 URL filter·검수 상태와 상세 이동을 표현한다 */
import { useState, type FormEvent } from 'react';
import {
  type VocabularyCandidateListQuery,
  type VocabularyCandidateListResponse,
} from '@flex-thia/contracts';
import { z } from 'zod';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

export interface VocabularyCandidateManagementPageViewProps {
  data?: VocabularyCandidateListResponse;
  error: boolean;
  loading: boolean;
  onFilterChange: (
    patch: Pick<
      Partial<VocabularyCandidateListQuery>,
      'jobId' | 'reviewStatus'
    >,
  ) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  search: VocabularyCandidateListQuery;
}

const uuidSchema = z.uuid();

const statusLabel = (
  candidate: VocabularyCandidateListResponse['items'][number],
) => {
  if (
    candidate.review.status === 'PENDING' &&
    candidate.resultGroup === 'FAILED'
  ) {
    return '검증 실패';
  }
  return {
    PENDING: '검수 대기',
    APPROVED: '승인 완료',
    DISCARDED: '폐기 완료',
  }[candidate.review.status];
};

function JobFilterForm({
  initialJobId,
  onFilterChange,
}: Pick<VocabularyCandidateManagementPageViewProps, 'onFilterChange'> & {
  initialJobId: string;
}) {
  const [jobId, setJobId] = useState(initialJobId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (jobId === '') onFilterChange({ jobId: undefined });
    else if (uuidSchema.safeParse(jobId).success) onFilterChange({ jobId });
  };
  return (
    <form
      className='flex items-end gap-cluster'
      onSubmit={submit}
    >
      <div className='grid gap-cluster'>
        <Label htmlFor='vocabulary-candidate-job-id'>생성 job ID</Label>
        <Input
          id='vocabulary-candidate-job-id'
          onChange={(event) => setJobId(event.target.value.trim())}
          value={jobId}
        />
      </div>
      <Button
        disabled={jobId !== '' && !uuidSchema.safeParse(jobId).success}
        type='submit'
        variant='outline'
      >
        job 필터 적용
      </Button>
    </form>
  );
}

function CandidateFilters({
  onFilterChange,
  search,
}: Pick<
  VocabularyCandidateManagementPageViewProps,
  'onFilterChange' | 'search'
>) {
  return (
    <div className='flex flex-wrap items-end gap-cluster'>
      <JobFilterForm
        initialJobId={search.jobId ?? ''}
        key={search.jobId ?? ''}
        onFilterChange={onFilterChange}
      />
      <div className='grid gap-cluster'>
        <Label htmlFor='vocabulary-candidate-review-status'>검수 상태</Label>
        <Select
          onValueChange={(value) =>
            onFilterChange({
              reviewStatus:
                value === 'ALL'
                  ? undefined
                  : (value as VocabularyCandidateListQuery['reviewStatus']),
            })
          }
          value={search.reviewStatus ?? 'ALL'}
        >
          <SelectTrigger
            aria-label='검수 상태'
            id='vocabulary-candidate-review-status'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>전체</SelectItem>
            <SelectItem value='PENDING'>검수 대기</SelectItem>
            <SelectItem value='APPROVED'>승인 완료</SelectItem>
            <SelectItem value='DISCARDED'>폐기 완료</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CandidateResults({
  data,
  error,
  loading,
  onPageChange,
  onRetry,
}: Omit<
  VocabularyCandidateManagementPageViewProps,
  'onFilterChange' | 'search'
>) {
  if (loading) return <PageLoading message='어휘 후보를 불러오고 있습니다.' />;
  if (error) {
    return (
      <PageError
        message='어휘 후보를 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (!data || data.items.length === 0) {
    return <PageEmpty title='조건에 맞는 어휘 후보가 없습니다.' />;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>태국어</TableHead>
            <TableHead>분류</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>상세</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((candidate) => (
            <TableRow key={candidate.id}>
              <TableCell>{candidate.thai}</TableCell>
              <TableCell>
                <Badge>{candidate.classification}</Badge>
              </TableCell>
              <TableCell>{statusLabel(candidate)}</TableCell>
              <TableCell>
                <Button
                  asChild
                  size='sm'
                  variant='link'
                >
                  <a
                    href={`/admin/content-production/vocabulary-candidates/${candidate.id}`}
                  >
                    상세 열기
                  </a>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav
        aria-label='어휘 후보 페이지'
        className='flex items-center gap-cluster'
      >
        <Button
          disabled={data.page.page <= 1}
          onClick={() => onPageChange(data.page.page - 1)}
          type='button'
          variant='outline'
        >
          이전
        </Button>
        <span>
          {data.page.page} / {Math.max(1, data.page.totalPages)}
        </span>
        <Button
          disabled={data.page.page >= data.page.totalPages}
          onClick={() => onPageChange(data.page.page + 1)}
          type='button'
          variant='outline'
        >
          다음
        </Button>
      </nav>
    </>
  );
}

/** pending·validation failure·terminal 상태를 혼동하지 않게 분리한다 */
export function VocabularyCandidateManagementPageView({
  data,
  error,
  loading,
  onFilterChange,
  onPageChange,
  onRetry,
  search,
}: VocabularyCandidateManagementPageViewProps) {
  return (
    <section className='grid gap-section'>
      <header>
        <h1 className='text-title text-primary'>어휘 후보 검수</h1>
        <p className='text-body text-subtle'>
          추출 snapshot과 검증 결과를 확인한 뒤 후보를 검수합니다.
        </p>
      </header>
      <CandidateFilters
        onFilterChange={onFilterChange}
        search={search}
      />
      <CandidateResults
        {...(data ? { data } : {})}
        error={error}
        loading={loading}
        onPageChange={onPageChange}
        onRetry={onRetry}
      />
    </section>
  );
}
