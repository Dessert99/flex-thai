/** 관리자 콘텐츠 가져오기 mutation과 이력 Query를 Page View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentImportListQueryOptions,
  createContentImport,
} from '../api/contentImportQueries';
import type { ContentImportCommand } from '../api/contentImportQueries';
import type { ContentImportListSearch } from '../model/contentImportListSearch';
import { ContentImportListPageView } from './ContentImportListPageView';

interface ContentImportListPageContainerProps {
  onSearchChange?: (search: ContentImportListSearch) => void;
  search?: ContentImportListSearch;
}

const defaultSearch = { page: 1, pageSize: 20 };

/** 명령 성공 시 가져오기 목록과 생성된 상세 cache만 무효화한다 */
export function ContentImportListPageContainer({
  onSearchChange = () => undefined,
  search = defaultSearch,
}: ContentImportListPageContainerProps) {
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

  return (
    <ContentImportListPageView
      data={imports.data}
      importError={createImport.error}
      importing={createImport.isPending}
      importSucceeded={createImport.isSuccess}
      listError={imports.isError}
      loading={imports.isPending}
      onImport={(command: ContentImportCommand) => createImport.mutate(command)}
      onImportReset={() => createImport.reset()}
      onPageChange={(page) => onSearchChange({ ...search, page })}
      onRetry={() => void imports.refetch()}
    />
  );
}
