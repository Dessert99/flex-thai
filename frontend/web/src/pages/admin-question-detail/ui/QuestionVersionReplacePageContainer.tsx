/** 문제 상세 Query와 교체·검증 mutation을 직접 URL Page에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminQuestionVersionPayload } from '@flex-thia/contracts';
import { adminQuestionDetailQueryOptions } from '../api/adminQuestionDetailQueries';
import {
  replaceQuestionVersion,
  validateQuestionVersion,
} from '../api/questionVersionMutations';
import { QuestionVersionReplacePageView } from './QuestionVersionReplacePageView';

interface QuestionVersionReplacePageContainerProps {
  questionId: string;
  versionId: string;
}

/** 교체 성공 시 상세 cache만 stale 처리하고 FAILED 검증도 data로 보존한다 */
export function QuestionVersionReplacePageContainer({
  questionId,
  versionId,
}: QuestionVersionReplacePageContainerProps) {
  const queryClient = useQueryClient();
  const detail = useQuery(adminQuestionDetailQueryOptions(questionId));
  const replace = useMutation({
    mutationFn: (payload: AdminQuestionVersionPayload) =>
      replaceQuestionVersion({ payload, versionId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['admin', 'questions', 'detail', questionId],
        refetchType: 'none',
      }),
    retry: false,
  });
  const validate = useMutation({
    mutationFn: () => validateQuestionVersion(versionId),
    retry: false,
  });

  return (
    <QuestionVersionReplacePageView
      data={detail.data}
      detailError={detail.error}
      loading={detail.isPending}
      onReplace={(payload) => replace.mutate(payload)}
      onRetry={() => void detail.refetch()}
      onValidate={() => validate.mutate()}
      replaceError={replace.error}
      replaced={replace.isSuccess}
      replacing={replace.isPending}
      validationReport={validate.data}
      validating={validate.isPending}
      versionId={versionId}
    />
  );
}
