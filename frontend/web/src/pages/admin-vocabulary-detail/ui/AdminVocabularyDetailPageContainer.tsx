/** 관리자 어휘 상세·교체와 exact cache invalidation을 조립한다 */
import type { AdminVocabularyReplaceRequest } from '@flex-thia/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminVocabularyDetailQueryOptions,
  replaceAdminVocabulary,
} from '../api/adminVocabularyMutations';
import { AdminVocabularyDetailPageView } from './AdminVocabularyDetailPageView';

/** 관리자 어휘 상세 route의 입력 */
export interface AdminVocabularyDetailPageContainerProps {
  vocabularyId: string;
}

/** 서버 성공 뒤 목록·상세 key만 무효화하고 optimistic 상태를 만들지 않는다 */
export function AdminVocabularyDetailPageContainer({
  vocabularyId,
}: AdminVocabularyDetailPageContainerProps) {
  const queryClient = useQueryClient();
  const detail = useQuery(adminVocabularyDetailQueryOptions(vocabularyId));
  const replace = useMutation({
    mutationFn: (payload: AdminVocabularyReplaceRequest) =>
      replaceAdminVocabulary({ payload, vocabularyId }),
    onSuccess: () => refresh(),
    retry: false,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['admin', 'vocabularies', 'detail', vocabularyId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin', 'vocabularies', 'list'],
      }),
    ]);
  return (
    <AdminVocabularyDetailPageView
      data={detail.data}
      error={detail.isError}
      onReplace={(payload) => replace.mutate(payload)}
      onRetry={() => void detail.refetch()}
      replaceError={replace.isError}
      replacing={replace.isPending}
    />
  );
}
