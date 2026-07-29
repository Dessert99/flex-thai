/** 후보 상세 query와 optimistic revision 검수 command를 View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveQuestionCandidate,
  discardQuestionCandidate,
  questionCandidateQueryOptions,
  regenerateQuestionCandidate,
} from '@/features/review-question-candidates';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { QuestionCandidateDetailPageView } from './QuestionCandidateDetailPageView';

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
    return <PageLoading message='문제 후보를 불러오고 있습니다.' />;
  if (query.isError || !query.data) {
    return (
      <PageError
        message='문제 후보를 불러오지 못했습니다.'
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <QuestionCandidateDetailPageView
      data={query.data}
      onApprove={() => action.mutate('APPROVE')}
      onDiscard={() => action.mutate('DISCARD')}
      onRegenerate={() => action.mutate('REGENERATE')}
      pending={action.isPending}
    />
  );
}
