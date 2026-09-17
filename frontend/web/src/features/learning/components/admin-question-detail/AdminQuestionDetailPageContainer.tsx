/** 현재 문제 조회·수정·공개 상태를 연결한다. */
import type {
  AdminQuestionStatusRequest,
  AdminQuestionUpdateRequest,
} from '@flex-thia/contracts/admin/questions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminQuestionDetailQueryOptions } from '../../apis/admin-question-detail/adminQuestionDetailQueries';
import {
  changeQuestionStatus,
  updateQuestion,
} from '../../apis/admin-question-detail/questionMutations';
import { AdminQuestionDetailPageView } from './AdminQuestionDetailPageView';
export function AdminQuestionDetailPageContainer({
  questionId,
}: {
  questionId: string;
}) {
  const client = useQueryClient();
  const detail = useQuery(adminQuestionDetailQueryOptions(questionId));
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['admin', 'questions'] }),
      client.invalidateQueries({ queryKey: ['learner', 'questions'] }),
      client.invalidateQueries({ queryKey: ['admin', 'vocabularies'] }),
    ]);
  const update = useMutation({
    throwOnError: false,
    mutationFn: (input: AdminQuestionUpdateRequest) =>
      updateQuestion(questionId, input),
    onSuccess: refresh,
  });
  const state = useMutation({
    throwOnError: false,
    mutationFn: (input: AdminQuestionStatusRequest) =>
      changeQuestionStatus(questionId, input),
    onSuccess: refresh,
  });
  if (!detail.data)
    return (
      <p role='status'>
        {detail.isError
          ? '문제를 불러오지 못했습니다.'
          : '문제를 불러오는 중입니다.'}
      </p>
    );
  return (
    <AdminQuestionDetailPageView
      key={detail.data.updatedAt}
      data={detail.data}
      onSave={(input) => update.mutate(input)}
      onStatus={(input) => state.mutate(input)}
      pending={update.isPending || state.isPending}
      error={update.isError || state.isError}
    />
  );
}
