import {
  updateOperationsCostSettings,
  usageCostOverviewQueryOptions,
  usageCostQueryKey,
  usageCostSettingsQueryKey,
  usageCostSettingsQueryOptions,
} from '@/features/operations/apis/usage-cost-operations/usageCostQueries';
import type { UsageCostSearch } from '@/features/operations/libs/usage-cost-operations/usageCostSearch';
import { isApiError } from '@/shared/apis/ApiError';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface UsageCostOperationsPageProps {
  search: UsageCostSearch;
  onSearchChange: (search: UsageCostSearch) => void;
}
export function useUsageCostOperations({
  search,
  onSearchChange,
}: UsageCostOperationsPageProps) {
  const overview = useQuery(usageCostOverviewQueryOptions(search));

  const settings = useQuery(usageCostSettingsQueryOptions());

  const queryClient = useQueryClient();

  const [settingsConflict, setSettingsConflict] = useState(false);

  const update = useMutation({
    mutationFn: updateOperationsCostSettings,
    onError: async (error) => {
      if (
        isApiError(error) &&
        error.detail.kind === 'problem' &&
        error.detail.problem.status === 409
      ) {
        setSettingsConflict(true);
        await queryClient.invalidateQueries({
          exact: true,
          queryKey: usageCostSettingsQueryKey,
        });
      }
    },
    onSuccess: async () => {
      setSettingsConflict(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usageCostQueryKey }),
        queryClient.invalidateQueries({ queryKey: usageCostSettingsQueryKey }),
      ]);
    },
  });

  const changeSearch = (patch: Partial<UsageCostSearch>) =>
    onSearchChange({ ...search, ...patch });
  return {
    search,
    overview,
    settings,
    settingsConflict,
    setSettingsConflict,
    update,
    changeSearch,
  };
}
