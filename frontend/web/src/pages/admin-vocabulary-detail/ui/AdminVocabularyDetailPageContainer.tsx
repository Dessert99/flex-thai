/** 관리자 어휘 상세·교체·상태 action을 화면에 조립한다 */
import { useQuery } from '@tanstack/react-query';
import { VocabularyStateAction } from '@/features/change-vocabulary-state';
import { adminVocabularyDetailQueryOptions } from '../api/adminVocabularyMutations';
import { useAdminVocabularyDetailActions } from '../model/useAdminVocabularyDetailActions';
import { AdminVocabularyDetailPageView } from './AdminVocabularyDetailPageView';

/** 관리자 어휘 상세 route의 입력 */
export interface AdminVocabularyDetailPageContainerProps {
  vocabularyId: string;
}

/** 상세 조회와 mutation 명령을 view props로 변환한다 */
export function AdminVocabularyDetailPageContainer({
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
  return (
    <AdminVocabularyDetailPageView
      actions={
        detail.data && action ? (
          <VocabularyStateAction
            action={action}
            onConfirmed={() => void refresh()}
            vocabularyId={vocabularyId}
          />
        ) : null
      }
      data={detail.data}
      error={detail.isError}
      mergeMutating={previewMerge.isPending || merge.isPending}
      mergePreview={mergePreview}
      onCreateRelation={(payload) =>
        relation.mutate({
          kind: 'create',
          payload,
        })
      }
      onDeleteRelation={(relationId) =>
        relation.mutate({ kind: 'delete', relationId })
      }
      onMerge={(preview) => merge.mutate(preview)}
      onPreviewMerge={(representativeVocabularyId) =>
        previewMerge.mutate(representativeVocabularyId)
      }
      onRelationUpdate={(relationId, payload) =>
        relation.mutate({ kind: 'status', relationId, payload })
      }
      onRepresentativeChange={discardMergePreview}
      onReplace={(payload) => replace.mutate(payload)}
      onRetry={() => void detail.refetch()}
      replaceError={replace.isError}
      replacing={replace.isPending}
      relationMutating={relation.isPending}
    />
  );
}

function toStateAction(
  status: 'DRAFT' | 'HIDDEN' | 'MERGED' | 'PUBLISHED' | undefined,
) {
  if (status === 'DRAFT') return 'publish' as const;
  if (status === 'HIDDEN') return 'restore' as const;
  if (status === 'PUBLISHED') return 'hide' as const;
  return null;
}
