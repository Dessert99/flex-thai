import { QuestionCandidateGraph } from '@/features/content-production/components/question-candidate-detail/QuestionCandidateGraph';
import { QuestionCandidateActions } from '@/features/content-production/components/review-question-candidates/QuestionCandidateActions';
import { useQuestionCandidateDetail } from '@/features/content-production/hooks/question-candidate-detail/useQuestionCandidateDetail';
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
import type { QuestionCandidateDetailResponse } from '@flex-thia/contracts/content-production/question-production';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function QuestionCandidateDetailPage(
  pageInput: Parameters<typeof useQuestionCandidateDetail>[0],
) {
  const { query, action } = useQuestionCandidateDetail(pageInput);

  if (query.isPending)
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
              문제 후보를 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );

  if (query.isError || !query.data) {
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
              <p>문제 후보를 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void query.refetch()}
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
        <QuestionCandidateDetailContent
          data={query.data}
          onApprove={() => action.mutate('APPROVE')}
          onDiscard={() => action.mutate('DISCARD')}
          onRegenerate={() => action.mutate('REGENERATE')}
          pending={action.isPending}
        />
      </>
    </Container>
  );
}
/** 문제 후보의 canonical graph·네 검증 단계·검수 행동을 표현한다 */

export interface QuestionCandidateDetailPageViewProps {
  data: QuestionCandidateDetailResponse;
  pending?: boolean;
  onApprove: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
}

const validationStageLabel = {
  SCHEMA: '스키마',
  DECISION_RULE: '판정 규칙',
  SIMILARITY: '유사도',
  AI_CROSS_VALIDATION: 'AI 교차 검증',
} as const;

/** redacted payload는 실패 안내만 보여주고 canonical graph를 만들지 않는다 */
export function QuestionCandidateDetailContent({
  data,
  pending = false,
  onApprove,
  onDiscard,
  onRegenerate,
}: QuestionCandidateDetailPageViewProps) {
  const { candidate } = data;
  const reviewable = candidate.review.status === 'PENDING';
  return (
    <section className='grid gap-section'>
      <header className='flex items-center justify-between'>
        <h1 className='text-title text-primary'>문제 후보 상세</h1>
        <Badge>{candidate.resultGroup}</Badge>
      </header>
      {candidate.payloadState === 'CANONICAL' ? (
        <QuestionCandidateGraph payload={candidate.payload} />
      ) : (
        <Alert variant='destructive'>
          <AlertTitle>후보 payload를 표시할 수 없습니다.</AlertTitle>
          <AlertDescription>
            스키마 검증에 실패하여 안전한 공개 필드만 제공합니다.
          </AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>검증 단계</TableHead>
            <TableHead>결과</TableHead>
            <TableHead>코드</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.validations.map((validation) => (
            <TableRow key={validation.stage}>
              <TableCell>{validationStageLabel[validation.stage]}</TableCell>
              <TableCell>{validation.status}</TableCell>
              <TableCell>{validation.code ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <QuestionCandidateActions
        approveDisabled={
          candidate.resultGroup !== 'NORMAL' ||
          data.validations.some((validation) => validation.status !== 'PASSED')
        }
        disabled={!reviewable || pending}
        onApprove={onApprove}
        onDiscard={onDiscard}
        onRegenerate={onRegenerate}
      />
    </section>
  );
}
