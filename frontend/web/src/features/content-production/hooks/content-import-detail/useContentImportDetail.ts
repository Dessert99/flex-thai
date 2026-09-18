import { contentImportDetailQueryOptions } from '@/features/content-production/apis/content-import-detail/contentImportDetailQueries';
import type { ContentImportDetailPageViewProps } from '@/features/content-production/libs/content-import-detail/contentImportDetailPageTypes';
import { useQuery } from '@tanstack/react-query';

interface ContentImportDetailPageContainerProps {
  importId: string;
}
export function useContentImportDetail({
  importId,
}: ContentImportDetailPageContainerProps): ContentImportDetailPageViewProps {
  const detail = useQuery(contentImportDetailQueryOptions(importId));
  return {
    data: detail.data,
    error: detail.isError,
    loading: detail.isPending,
    onRetry: () => void detail.refetch(),
  };
}
