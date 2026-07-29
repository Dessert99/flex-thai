/** 문제 후보의 canonical graph·네 검증 단계·검수 행동을 표현한다 */
import type { QuestionCandidateDetailResponse } from '@flex-thia/contracts';
import { QuestionCandidateActions } from '@/features/review-question-candidates';
import { Badge } from '@/shared/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { QuestionCandidateGraph } from './QuestionCandidateGraph';

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
export function QuestionCandidateDetailPageView({
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
