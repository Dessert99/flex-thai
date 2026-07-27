/** 문제 분류 설정 query와 모든 mutation을 View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addApprovedExample,
  archiveTaxonomyTerm,
  changeQuestionTypeVersionStatus,
  createQuestionType,
  createQuestionTypeVersion,
  createTaxonomyTerm,
  questionTaxonomySettingsQueryOptions,
  replaceDifficultyCriteria,
} from '../api/questionTaxonomyQueries';
import { QuestionTaxonomySettingsPageView } from './QuestionTaxonomySettingsPageView';

/** mutation 성공 뒤 하나의 설정 query만 무효화한다 */
export function QuestionTaxonomySettingsPageContainer() {
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
  return (
    <QuestionTaxonomySettingsPageView
      data={settings.data}
      error={settings.isError}
      loading={settings.isPending}
      onActivate={(versionId) =>
        run(() =>
          changeQuestionTypeVersionStatus({ versionId, action: 'activate' }),
        )
      }
      onAddExample={(versionId, input) =>
        run(() => addApprovedExample({ versionId, input }))
      }
      onArchiveTerm={(kind, id) =>
        run(() => archiveTaxonomyTerm({ kind, id }))
      }
      onCreateTerm={(kind, input) =>
        run(() => createTaxonomyTerm({ kind, input }))
      }
      onCreateType={(input) => run(() => createQuestionType(input))}
      onCreateVersion={(questionTypeId, input) =>
        run(() => createQuestionTypeVersion({ questionTypeId, input }))
      }
      onRetry={() => void settings.refetch()}
      onRetire={(versionId) =>
        run(() =>
          changeQuestionTypeVersionStatus({ versionId, action: 'retire' }),
        )
      }
      onSaveCriteria={(versionId, input) =>
        run(() => replaceDifficultyCriteria({ versionId, input }))
      }
    />
  );
}
