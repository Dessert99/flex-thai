/** 어휘 후보 목록의 검수·검증 상태와 상세 이동을 표현한다 */
import type { VocabularyCandidateListResponse } from '@flex-thia/contracts';
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

export interface VocabularyCandidateManagementPageViewProps {
  data?: VocabularyCandidateListResponse;
  error: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

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

/** pending·validation failure·terminal 상태를 혼동하지 않게 분리한다 */
export function VocabularyCandidateManagementPageView({
  data,
  error,
  loading,
  onPageChange,
  onRetry,
}: VocabularyCandidateManagementPageViewProps) {
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
    <section className='grid gap-section'>
      <header>
        <h1 className='text-title text-primary'>어휘 후보 검수</h1>
        <p className='text-body text-subtle'>
          추출 snapshot과 검증 결과를 확인한 뒤 후보를 검수합니다.
        </p>
      </header>
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
    </section>
  );
}
