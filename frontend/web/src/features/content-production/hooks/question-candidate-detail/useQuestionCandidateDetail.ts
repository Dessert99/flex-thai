import {
  approveQuestionCandidate,
  discardQuestionCandidate,
  questionCandidateQueryOptions,
  regenerateQuestionCandidate,
} from '@/features/content-production/apis/review-question-candidates/questionCandidateApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useQuestionCandidateDetail({
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
  return { query, action };
}
