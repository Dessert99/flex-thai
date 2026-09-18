import {
  assignContentErrorReport,
  changeContentErrorReportStatus,
  unassignContentErrorReport,
} from '@/features/operations/apis/content-error-report-management/contentErrorReportMutations';
import {
  contentErrorReportDetailQueryOptions,
  contentErrorReportListQueryOptions,
} from '@/features/operations/apis/content-error-report-management/contentErrorReportQueries';
import type { ContentErrorReportManagementPageViewProps } from '@/features/operations/libs/content-error-report-management/contentErrorReportManagementPageTypes';
import {
  serializeContentErrorReportSearch,
  type ContentErrorReportSearch,
} from '@/features/operations/libs/content-error-report-management/contentErrorReportSearch';
import type { ContentErrorReportStatus } from '@flex-thia/contracts/feedback/content-error-reports';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export function useContentErrorReportManagement({
  search,
  onSearchChange,
}: {
  search: ContentErrorReportSearch;
  onSearchChange: (search: ContentErrorReportSearch) => void;
}): ContentErrorReportManagementPageViewProps {
  const client = useQueryClient();

  const [selectedId, setSelectedId] = useState<string>();

  const list = useQuery(
    contentErrorReportListQueryOptions(
      serializeContentErrorReportSearch(search),
    ),
  );

  const detail = useQuery({
    ...contentErrorReportDetailQueryOptions(selectedId ?? ''),
    enabled: Boolean(selectedId),
  });

  const mutation = useMutation({
    mutationFn: async (
      command:
        | { kind: 'STATUS'; status: ContentErrorReportStatus }
        | { kind: 'ASSIGN'; assigneeUserId: string }
        | { kind: 'UNASSIGN' },
    ) => {
      if (!selectedId) throw new Error('CONTENT_ERROR_REPORT_NOT_SELECTED');
      if (command.kind === 'STATUS')
        return changeContentErrorReportStatus(selectedId, command.status);
      if (command.kind === 'ASSIGN')
        return assignContentErrorReport(selectedId, command.assigneeUserId);
      return unassignContentErrorReport(selectedId);
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ['admin', 'content-error-reports'],
      });
    },
  });
  return {
    reports: list.data,
    detail: detail.data,
    search: search,
    loading: list.isLoading,
    detailLoading: detail.isLoading,
    error: list.isError,
    detailError: detail.isError,
    mutationError: mutation.isError,
    mutating: mutation.isPending,
    onSearchChange: onSearchChange,
    onSelect: setSelectedId,
    onStatusChange: (status) => mutation.mutate({ kind: 'STATUS', status }),
    onAssign: (assigneeUserId) =>
      mutation.mutate({ kind: 'ASSIGN', assigneeUserId }),
    onUnassign: () => mutation.mutate({ kind: 'UNASSIGN' }),
  };
}
