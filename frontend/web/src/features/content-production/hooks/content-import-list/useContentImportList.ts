import type { ContentImportCommand } from '@/features/content-production/apis/content-import-list/contentImportQueries';
import {
  contentImportListQueryOptions,
  createContentImport,
} from '@/features/content-production/apis/content-import-list/contentImportQueries';
import type { ContentImportListPageViewProps } from '@/features/content-production/libs/content-import-list/contentImportListPageTypes';
import type { ContentImportListSearch } from '@/features/content-production/libs/content-import-list/contentImportListSearch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface ContentImportListPageContainerProps {
  onSearchChange?: (search: ContentImportListSearch) => void;
  search?: ContentImportListSearch;
}

const defaultSearch = { page: 1, pageSize: 20 };
export function useContentImportList({
  onSearchChange = () => undefined,
  search = defaultSearch,
}: ContentImportListPageContainerProps): ContentImportListPageViewProps {
  const queryClient = useQueryClient();

  const imports = useQuery(contentImportListQueryOptions(search));

  const createImport = useMutation({
    mutationFn: createContentImport,
    onSuccess: async (detail) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['admin', 'content-imports', 'list'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['admin', 'content-imports', 'detail', detail.id],
        }),
      ]);
    },
    retry: false,
  });
  return {
    data: imports.data,
    importError: createImport.error,
    importing: createImport.isPending,
    importSucceeded: createImport.isSuccess,
    listError: imports.isError,
    loading: imports.isPending,
    onImport: (command: ContentImportCommand) => createImport.mutate(command),
    onImportReset: () => createImport.reset(),
    onPageChange: (page) => onSearchChange({ ...search, page }),
    onRetry: () => void imports.refetch(),
  };
}
