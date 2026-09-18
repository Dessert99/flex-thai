import {
  type CreateQuestionTaxonomyTermRequest,
  type CreateQuestionTypeRequest,
  type CreateQuestionTypeVersionRequest,
  type QuestionTaxonomySettingsResponse,
  type QuestionTypeApprovedExampleRequest,
  type ReplaceDifficultyCriteriaRequest,
} from '@flex-thia/contracts/questions/question-taxonomy-settings';
export type Term = QuestionTaxonomySettingsResponse['topics'][number];
export interface Props {
  data: QuestionTaxonomySettingsResponse | undefined;
  error: boolean;
  loading: boolean;
  onActivate: (versionId: string) => void;
  onAddExample?: (
    versionId: string,
    input: QuestionTypeApprovedExampleRequest,
  ) => void;
  onArchiveTerm: (kind: 'topic' | 'tag', id: string) => void;
  onCreateTerm: (
    kind: 'topic' | 'tag',
    input: CreateQuestionTaxonomyTermRequest,
  ) => void;
  onCreateType: (input: CreateQuestionTypeRequest) => void;
  onCreateVersion: (
    questionTypeId: string,
    input: CreateQuestionTypeVersionRequest,
  ) => void;
  onRetry: () => void;
  onRetire: (versionId: string) => void;
  onSaveCriteria: (
    versionId: string,
    input: ReplaceDifficultyCriteriaRequest,
  ) => void;
}
