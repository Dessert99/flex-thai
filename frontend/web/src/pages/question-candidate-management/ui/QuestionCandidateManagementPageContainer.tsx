/** 후보 목록 query와 bounded bulk 검수 mutation을 page View에 연결한다 */
import { useState } from 'react';
import type {
  QuestionCandidateListItem,
  QuestionCandidateListQuery,
} from '@flex-thia/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  questionCandidatesQueryOptions,
  runCandidateBulkAction,
} from '@/features/review-question-candidates';
import { QuestionCandidateManagementPageView } from './QuestionCandidateManagementPageView';

interface QuestionCandidateManagementPageContainerProps {
  search: QuestionCandidateListQuery;
  onSearchChange: (search: QuestionCandidateListQuery) => void;
}

/** 실패한 후보 ID만 selection에 남기고 관련 query를 명시적으로 갱신한다 */
export function QuestionCandidateManagementPageContainer({
  search,
  onSearchChange,
}: QuestionCandidateManagementPageContainerProps) {
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
  return (
    <QuestionCandidateManagementPageView
      {...(query.data ? { data: query.data } : {})}
      error={query.isError}
      loading={query.isPending}
      onAction={(action) => bulk.mutate(action)}
      onPageChange={(page) => onSearchChange({ ...search, page })}
      onRetry={() => void query.refetch()}
      onSelectionChange={toggle}
      pending={bulk.isPending}
      search={search}
      selectedIds={selected.map(({ candidateId }) => candidateId)}
    />
  );
}
