import {
  approveVocabularyCandidate,
  discardVocabularyCandidate,
  vocabularyCandidateQueryOptions,
  type VocabularyCandidateApprovalInput,
} from '@/features/content-production/apis/review-vocabulary-candidate/vocabularyCandidateApi';
import { isApiError } from '@/shared/apis/ApiError';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type ReviewCommand =
  | {
      kind: 'APPROVE';
      input: VocabularyCandidateApprovalInput;
    }
  | { kind: 'DISCARD' };
export function useVocabularyCandidateDetail({
  candidateId,
}: {
  candidateId: string;
}) {
  const client = useQueryClient();

  const query = useQuery(vocabularyCandidateQueryOptions(candidateId));

  const action = useMutation<unknown, unknown, ReviewCommand>({
    mutationFn: (command: ReviewCommand) => {
      const revision = query.data?.candidate.review.revision;
      if (revision === undefined) throw new Error('후보 revision이 없습니다.');
      return command.kind === 'APPROVE'
        ? approveVocabularyCandidate(candidateId, revision, command.input)
        : discardVocabularyCandidate(candidateId, revision);
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ['admin', 'content-production', 'vocabulary-candidates'],
        }),
        client.invalidateQueries({
          queryKey: [
            'admin',
            'content-production',
            'vocabulary-candidates',
            candidateId,
          ],
        }),
        client.invalidateQueries({
          queryKey: [
            'admin',
            'content-production',
            'jobs',
            query.data?.candidate.jobId,
          ],
        }),
      ]),
  });
  return { query, action, isApiError };
}
