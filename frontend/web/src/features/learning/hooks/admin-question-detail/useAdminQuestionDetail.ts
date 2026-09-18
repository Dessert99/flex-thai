import { adminQuestionDetailQueryOptions } from '@/features/learning/apis/admin-question-detail/adminQuestionDetailQueries';
import {
  changeQuestionStatus,
  updateQuestion,
} from '@/features/learning/apis/admin-question-detail/questionMutations';
import type {
  AdminQuestionStatusRequest,
  AdminQuestionUpdateRequest,
} from '@flex-thia/contracts/admin/questions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useAdminQuestionDetail({ questionId }: { questionId: string }) {
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
  return { detail, update, state };
}
