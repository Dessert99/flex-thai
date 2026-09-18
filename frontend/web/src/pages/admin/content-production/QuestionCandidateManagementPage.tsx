import { QuestionCandidateActions } from '@/features/content-production/components/review-question-candidates/QuestionCandidateActions';
import { useQuestionCandidateManagement } from '@/features/content-production/hooks/question-candidate-management/useQuestionCandidateManagement';
import type { CandidateTableProps } from '@/features/content-production/libs/question-candidate-management/questionCandidateManagementPageTypes';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
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
import { Link } from '@tanstack/react-router';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function QuestionCandidateManagementPage(
  pageInput: Parameters<typeof useQuestionCandidateManagement>[0],
) {
  const props = useQuestionCandidateManagement(pageInput);

  if (props.loading)
    return (
      <Container className='max-w-content flex-1'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            문제 후보를 불러오고 있습니다.
          </p>
        </section>
      </Container>
    );

  if (props.error) {
    return (
      <Container className='max-w-content flex-1'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>문제 후보를 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={props.onRetry}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </Container>
    );
  }

  if (!props.data || props.data.items.length === 0) {
    return (
      <Container className='max-w-content flex-1'>
        <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
          <h2 className='text-title text-primary'>
            조건에 맞는 문제 후보가 없습니다.
          </h2>
        </section>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <header>
          <h1 className='text-title text-primary'>문제 후보 검수</h1>
          <p className='text-body text-subtle'>
            성공한 항목은 선택에서 제거되고 실패한 항목은 그대로 남습니다.
          </p>
        </header>
        <QuestionCandidateActions
          approveDisabled={props.data.items.some(
            (candidate) =>
              props.selectedIds.includes(candidate.id) &&
              candidate.resultGroup !== 'NORMAL',
          )}
          disabled={props.pending || props.selectedIds.length === 0}
          onApprove={() => props.onAction('APPROVE')}
          onDiscard={() => props.onAction('DISCARD')}
          onRegenerate={() => props.onAction('REGENERATE')}
        />
        <CandidateTable
          items={props.data.items}
          onSelectionChange={props.onSelectionChange}
          pending={props.pending}
          selectedIds={props.selectedIds}
        />
        <CandidatePagination
          onPageChange={props.onPageChange}
          page={props.data.page.page}
          totalPages={props.data.page.totalPages}
        />
      </section>
    </Container>
  );
}

const groupLabel = {
  NORMAL: '정상',
  NEEDS_ATTENTION: '검토 필요',
  FAILED: '실패',
} as const;

function CandidateTable(props: CandidateTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>선택</TableHead>
          <TableHead>그룹</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>난이도</TableHead>
          <TableHead>상세</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map((candidate) => {
          const selected = props.selectedIds.includes(candidate.id);
          return (
            <TableRow
              data-state={selected ? 'selected' : undefined}
              key={candidate.id}
            >
              <TableCell>
                <Button
                  aria-pressed={selected}
                  disabled={
                    props.pending || candidate.review.status !== 'PENDING'
                  }
                  onClick={() => props.onSelectionChange(candidate)}
                  size='sm'
                  type='button'
                  variant='outline'
                >
                  {selected ? '선택 해제' : '선택'}
                </Button>
              </TableCell>
              <TableCell>
                <Badge>{groupLabel[candidate.resultGroup]}</Badge>
              </TableCell>
              <TableCell>{candidate.review.status}</TableCell>
              <TableCell>
                {candidate.payloadState === 'CANONICAL'
                  ? candidate.difficulty
                  : '비공개'}
              </TableCell>
              <TableCell>
                <Button
                  asChild
                  size='sm'
                  variant='link'
                >
                  <Link
                    to='/admin/content-production/candidates/$candidateId'
                    params={{ candidateId: candidate.id }}
                  >
                    열기
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CandidatePagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label='후보 페이지'
      className='flex items-center gap-cluster'
    >
      <Button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type='button'
        variant='outline'
      >
        이전
      </Button>
      <span>
        {page} / {Math.max(1, totalPages)}
      </span>
      <Button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type='button'
        variant='outline'
      >
        다음
      </Button>
    </nav>
  );
}
