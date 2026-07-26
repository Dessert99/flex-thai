/** 관리자 오류 신고 query와 mutation invalidation을 화면에 연결한다 */
import type { ContentErrorReportStatus } from '@flex-thia/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  assignContentErrorReport,
  changeContentErrorReportStatus,
  unassignContentErrorReport,
} from '../api/contentErrorReportMutations';
import {
  contentErrorReportDetailQueryOptions,
  contentErrorReportListQueryOptions,
} from '../api/contentErrorReportQueries';
import {
  serializeContentErrorReportSearch,
  type ContentErrorReportSearch,
} from '../model/contentErrorReportSearch';
import { ContentErrorReportManagementPageView } from './ContentErrorReportManagementPageView';

/** 목록·상세를 동기화하고 모든 command 성공 뒤 feedback query를 갱신한다 */
export function ContentErrorReportManagementPageContainer({
  search,
  onSearchChange,
}: {
  search: ContentErrorReportSearch;
  onSearchChange: (search: ContentErrorReportSearch) => void;
}) {
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
  return (
    <ContentErrorReportManagementPageView
      reports={list.data}
      detail={detail.data}
      search={search}
      loading={list.isLoading}
      detailLoading={detail.isLoading}
      error={list.isError}
      mutationError={detail.isError || mutation.isError}
      mutating={mutation.isPending}
      onSearchChange={onSearchChange}
      onSelect={setSelectedId}
      onStatusChange={(status) => mutation.mutate({ kind: 'STATUS', status })}
      onAssign={(assigneeUserId) =>
        mutation.mutate({ kind: 'ASSIGN', assigneeUserId })
      }
      onUnassign={() => mutation.mutate({ kind: 'UNASSIGN' })}
    />
  );
}
