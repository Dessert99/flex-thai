/** 단어장 목록 서버 상태를 화면 상태로 변환한다 */
import { useQuery } from '@tanstack/react-query';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { wordbookListQueryOptions } from '../api/wordbookListQueries';
import { WordbookListPageView } from './WordbookListPageView';

/** 목록 loading·error·success를 분리해 렌더링한다 */
export function WordbookListPageContainer() {
  const wordbooks = useQuery(wordbookListQueryOptions());
  if (wordbooks.isPending) {
    return <PageLoading message='단어장을 불러오고 있습니다.' />;
  }
  if (wordbooks.isError || wordbooks.data === undefined) {
    return (
      <PageError
        message='단어장을 불러오지 못했습니다.'
        onRetry={() => void wordbooks.refetch()}
      />
    );
  }
  return <WordbookListPageView items={wordbooks.data.items} />;
}
