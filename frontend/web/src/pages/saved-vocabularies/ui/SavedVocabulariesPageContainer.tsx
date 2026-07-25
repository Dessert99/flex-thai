/** 저장 어휘 목록의 Page 상태를 관리한다 */
import { useQuery } from '@tanstack/react-query';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import { savedVocabularyQueryOptions } from '../api/savedVocabularyQueries';
import { SavedVocabulariesPageView } from './SavedVocabulariesPageView';

/** 저장 목록 성공·빈 상태·오류를 분리한다 */
export function SavedVocabulariesPageContainer() {
  const saved = useQuery(savedVocabularyQueryOptions());
  if (saved.isPending)
    return <PageLoading message='저장 어휘를 불러오고 있습니다.' />;
  if (saved.isError || saved.data === undefined) {
    return (
      <PageError
        message='저장 어휘를 불러오지 못했습니다.'
        onRetry={() => void saved.refetch()}
      />
    );
  }
  if (saved.data.items.length === 0) {
    return (
      <PageEmpty
        action={<a href='/vocabularies'>어휘 찾기</a>}
        title='저장한 어휘가 없습니다.'
      />
    );
  }
  return <SavedVocabulariesPageView items={saved.data.items} />;
}
