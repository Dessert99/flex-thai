import { questionCandidatesQueryOptions } from '@/features/content-production/apis/review-question-candidates/questionCandidateApi';
import type { QuestionCandidateManagementPageViewProps } from '@/features/content-production/libs/question-candidate-management/questionCandidateManagementPageTypes';
import { runCandidateBulkAction } from '@/features/content-production/libs/review-question-candidates/runCandidateBulkAction';
import type {
  QuestionCandidateListItem,
  QuestionCandidateListQuery,
} from '@flex-thia/contracts/content-production/question-production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface QuestionCandidateManagementPageContainerProps {
  search: QuestionCandidateListQuery;
  onSearchChange: (search: QuestionCandidateListQuery) => void;
}
export function useQuestionCandidateManagement({
  search,
  onSearchChange,
}: QuestionCandidateManagementPageContainerProps): QuestionCandidateManagementPageViewProps {
  const client = useQueryClient();

  const query = useQuery(questionCandidatesQueryOptions(search));

  const [selected, setSelected] = useState<
    Array<{ candidateId: string; jobId: string; revision: number }>
  >([]);

  const bulk = useMutation({
    mutationFn: (action: 'APPROVE' | 'DISCARD' | 'REGENERATE') =>
      runCandidateBulkAction(selected, action),
    onSettled: async (results) => {
      setSelected(
        (results ?? [])
          .filter((result) => result.status === 'FAILED')
          .flatMap((result) => {
            const target = selected.find(
              ({ candidateId }) => candidateId === result.candidateId,
            );
            return target ? [target] : [];
          }),
      );
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['admin', 'content-production', 'candidates'],
        }),
        ...selected.map(({ candidateId }) =>
          client.invalidateQueries({
            queryKey: [
              'admin',
              'content-production',
              'candidates',
              candidateId,
            ],
          }),
        ),
        ...[...new Set(selected.map(({ jobId }) => jobId))].map((jobId) =>
          client.invalidateQueries({
            queryKey: ['admin', 'content-production', 'jobs', jobId],
          }),
        ),
      ]);
    },
  });

  const toggle = (candidate: QuestionCandidateListItem) => {
    setSelected((current) =>
      current.some(({ candidateId }) => candidateId === candidate.id)
        ? current.filter(({ candidateId }) => candidateId !== candidate.id)
        : [
            ...current,
            {
              candidateId: candidate.id,
              jobId: candidate.jobId,
              revision: candidate.review.revision,
            },
          ],
    );
  };
  return {
    ...(query.data ? { data: query.data } : {}),
    error: query.isError,
    loading: query.isPending,
    onAction: (action) => bulk.mutate(action),
    onPageChange: (page) => onSearchChange({ ...search, page }),
    onRetry: () => void query.refetch(),
    onSelectionChange: toggle,
    pending: bulk.isPending,
    search: search,
    selectedIds: selected.map(({ candidateId }) => candidateId),
  };
}
