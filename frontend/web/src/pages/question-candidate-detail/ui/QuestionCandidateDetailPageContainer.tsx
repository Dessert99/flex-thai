/** 후보 상세 query와 optimistic revision 검수 command를 View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveQuestionCandidate,
  discardQuestionCandidate,
  questionCandidateQueryOptions,
  regenerateQuestionCandidate,
} from '@/features/review-question-candidates';

import { QuestionCandidateDetailPageView } from './QuestionCandidateDetailPageView';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

/** 성공·409 모두 목록과 상세를 다시 읽어 stale revision 자동 재생을 막는다 */
export function QuestionCandidateDetailPageContainer({
  candidateId,
}: {
  candidateId: string;
}) {
  const client = useQueryClient();
  const query = useQuery(questionCandidateQueryOptions(candidateId));
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: ['admin', 'content-production', 'candidates'],
      }),
      client.invalidateQueries({
        queryKey: ['admin', 'content-production', 'candidates', candidateId],
      }),
      client.invalidateQueries({
        queryKey: [
          'admin',
          'content-production',
          'jobs',
          query.data?.candidate.jobId,
        ],
      }),
    ]);
  const action = useMutation<
    unknown,
    unknown,
    'APPROVE' | 'DISCARD' | 'REGENERATE'
  >({
    mutationFn: (kind: 'APPROVE' | 'DISCARD' | 'REGENERATE') => {
      const revision = query.data?.candidate.review.revision;
      if (revision === undefined) throw new Error('후보 revision이 없습니다.');
      if (kind === 'APPROVE') {
        return approveQuestionCandidate(candidateId, revision);
      }
      if (kind === 'DISCARD') {
        return discardQuestionCandidate(candidateId, revision);
      }
      return regenerateQuestionCandidate(candidateId, revision);
    },
    onSettled: invalidate,
  });
  if (query.isPending)
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
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
      </div>
    );
  if (query.isError || !query.data) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
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
      </div>
    );
  }
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <QuestionCandidateDetailPageView
        data={query.data}
        onApprove={() => action.mutate('APPROVE')}
        onDiscard={() => action.mutate('DISCARD')}
        onRegenerate={() => action.mutate('REGENERATE')}
        pending={action.isPending}
      />
    </div>
  );
}
