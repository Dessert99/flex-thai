/** 관리자 콘텐츠 가져오기 상세 Query를 결과 View에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { contentImportDetailQueryOptions } from '../api/contentImportDetailQueries';
import { ContentImportDetailPageView } from './ContentImportDetailPageView';

interface ContentImportDetailPageContainerProps {
  importId: string;
}

/** 검증된 route UUID의 상세 서버 상태를 표시한다 */
export function ContentImportDetailPageContainer({
  importId,
}: ContentImportDetailPageContainerProps) {
  const detail = useQuery(contentImportDetailQueryOptions(importId));
  return (
    <ContentImportDetailPageView
      data={detail.data}
      error={detail.isError}
      loading={detail.isPending}
      onRetry={() => void detail.refetch()}
    />
  );
}
