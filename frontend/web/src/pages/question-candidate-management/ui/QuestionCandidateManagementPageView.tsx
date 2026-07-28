/** 문제 후보 목록의 필터·선택·부분 실패 bulk 상태를 표현한다 */
import type {
  QuestionCandidateListItem,
  QuestionCandidateListResponse,
  QuestionCandidateListQuery,
} from '@flex-thia/contracts';
import { QuestionCandidateActions } from '@/features/review-question-candidates';
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

export interface QuestionCandidateManagementPageViewProps {
  data?: QuestionCandidateListResponse;
  error: boolean;
  loading: boolean;
  pending: boolean;
  search: QuestionCandidateListQuery;
  selectedIds: string[];
  onAction: (action: 'APPROVE' | 'DISCARD' | 'REGENERATE') => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onSelectionChange: (candidate: QuestionCandidateListItem) => void;
}

const groupLabel = {
  NORMAL: '정상',
  NEEDS_ATTENTION: '검토 필요',
  FAILED: '실패',
} as const;

interface CandidateTableProps {
  items: QuestionCandidateListItem[];
  pending: boolean;
  selectedIds: string[];
  onSelectionChange: (candidate: QuestionCandidateListItem) => void;
}

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
                  <a
                    href={`/admin/content-production/candidates/${candidate.id}`}
                  >
                    열기
                  </a>
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

/** 목록 query 상태와 현재 page selection을 서로 덮지 않고 렌더링한다 */
export function QuestionCandidateManagementPageView(
  props: QuestionCandidateManagementPageViewProps,
) {
  if (props.loading)
    return <PageLoading message='문제 후보를 불러오고 있습니다.' />;
  if (props.error) {
    return (
      <PageError
        message='문제 후보를 불러오지 못했습니다.'
        onRetry={props.onRetry}
      />
    );
  }
  if (!props.data || props.data.items.length === 0) {
    return <PageEmpty title='조건에 맞는 문제 후보가 없습니다.' />;
  }
  return (
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
            candidate.resultGroup === 'FAILED',
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
  );
}
