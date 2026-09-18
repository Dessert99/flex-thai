import { adminVocabularyDetailQueryOptions } from '@/features/learning/apis/admin-vocabulary-detail/adminVocabularyMutations';
import { useAdminVocabularyDetailActions } from '@/features/learning/hooks/admin-vocabulary-detail/useAdminVocabularyDetailActions';
import { useQuery } from '@tanstack/react-query';

/** 관리자 어휘 상세 route의 입력 */
export interface AdminVocabularyDetailPageContainerProps {
  vocabularyId: string;
}

function toStateAction(
  status: 'DRAFT' | 'HIDDEN' | 'MERGED' | 'PUBLISHED' | undefined,
) {
  if (status === 'DRAFT') return 'publish' as const;
  if (status === 'HIDDEN') return 'restore' as const;
  if (status === 'PUBLISHED') return 'hide' as const;
  return null;
}
export function useAdminVocabularyDetail({
  vocabularyId,
}: AdminVocabularyDetailPageContainerProps) {
  const detail = useQuery(adminVocabularyDetailQueryOptions(vocabularyId));

  const {
    discardMergePreview,
    merge,
    mergePreview,
    previewMerge,
    refresh,
    relation,
    replace,
  } = useAdminVocabularyDetailActions(vocabularyId);

  const action = toStateAction(detail.data?.status);
  return {
    vocabularyId,
    detail,
    discardMergePreview,
    merge,
    mergePreview,
    previewMerge,
    refresh,
    relation,
    replace,
    action,
  };
}
