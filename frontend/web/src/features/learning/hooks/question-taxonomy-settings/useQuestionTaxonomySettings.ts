import {
  addApprovedExample,
  archiveTaxonomyTerm,
  changeQuestionTypeVersionStatus,
  createQuestionType,
  createQuestionTypeVersion,
  createTaxonomyTerm,
  questionTaxonomySettingsQueryOptions,
  replaceDifficultyCriteria,
} from '@/features/learning/apis/question-taxonomy-settings/questionTaxonomyQueries';
import type { Props } from '@/features/learning/libs/question-taxonomy-settings/questionTaxonomySettingsPageTypes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useQuestionTaxonomySettings(): Props {
  const client = useQueryClient();

  const settings = useQuery(questionTaxonomySettingsQueryOptions());

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin', 'question-taxonomy'] }),
  });

  const run = (work: () => Promise<unknown>) => {
    if (!mutation.isPending) mutation.mutate(work);
  };
  return {
    data: settings.data,
    error: settings.isError,
    loading: settings.isPending,
    onActivate: (versionId) =>
      run(() =>
        changeQuestionTypeVersionStatus({ versionId, action: 'activate' }),
      ),
    onAddExample: (versionId, input) =>
      run(() => addApprovedExample({ versionId, input })),
    onArchiveTerm: (kind, id) => run(() => archiveTaxonomyTerm({ kind, id })),
    onCreateTerm: (kind, input) =>
      run(() => createTaxonomyTerm({ kind, input })),
    onCreateType: (input) => run(() => createQuestionType(input)),
    onCreateVersion: (questionTypeId, input) =>
      run(() => createQuestionTypeVersion({ questionTypeId, input })),
    onRetry: () => void settings.refetch(),
    onRetire: (versionId) =>
      run(() =>
        changeQuestionTypeVersionStatus({ versionId, action: 'retire' }),
      ),
    onSaveCriteria: (versionId, input) =>
      run(() => replaceDifficultyCriteria({ versionId, input })),
  };
}
