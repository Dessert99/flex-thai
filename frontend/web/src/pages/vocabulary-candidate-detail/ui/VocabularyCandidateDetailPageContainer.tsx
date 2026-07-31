/** 어휘 후보 상세 query와 optimistic revision 검수 command를 View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveVocabularyCandidate,
  discardVocabularyCandidate,
  vocabularyCandidateQueryOptions,
  type VocabularyCandidateApprovalInput,
} from '@/features/review-vocabulary-candidate';
import { isApiError } from '@/shared/api';
import { toUserMessage } from '@/shared/lib/error';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { VocabularyCandidateDetailPageView } from './VocabularyCandidateDetailPageView';

type ReviewCommand =
  | {
      kind: 'APPROVE';
      input: VocabularyCandidateApprovalInput;
    }
  | { kind: 'DISCARD' };

/** 성공·409 모두 목록·상세·작업을 다시 읽어 stale revision 자동 재생을 막는다 */
export function VocabularyCandidateDetailPageContainer({
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
  if (query.isPending)
    return <PageLoading message='어휘 후보를 불러오고 있습니다.' />;
  if (query.isError || !query.data) {
    return (
      <PageError
        message='어휘 후보를 불러오지 못했습니다.'
        onRetry={() => void query.refetch()}
      />
    );
  }
  const errorMessage =
    isApiError(action.error) &&
    action.error.detail.kind === 'problem' &&
    action.error.detail.problem.status === 409
      ? '다른 검수자가 먼저 변경했습니다. 최신 후보를 다시 확인해 주세요.'
      : toUserMessage(action.error)?.message;
  return (
    <VocabularyCandidateDetailPageView
      data={query.data}
      {...(errorMessage ? { errorMessage } : {})}
      onCreateDraft={(input) => action.mutate({ kind: 'APPROVE', input })}
      onDiscard={() => action.mutate({ kind: 'DISCARD' })}
      onLinkExisting={(vocabularyId) =>
        action.mutate({
          kind: 'APPROVE',
          input: { action: 'LINK_EXISTING', vocabularyId },
        })
      }
      pending={action.isPending}
    />
  );
}
