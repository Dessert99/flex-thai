import {
  changeUserRole,
  changeUserStatus,
  userManagementQueryKey,
  userManagementQueryOptions,
} from '@/features/identity/apis/user-management/userManagementQueries';
import type { UserManagementSearch } from '@/features/identity/libs/user-management/userManagementSearch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface UserManagementPageProps {
  currentUserId?: string;
  onSearchChange?: (search: UserManagementSearch) => void;
  search?: UserManagementSearch;
}

const defaultSearch: UserManagementSearch = { page: 1, pageSize: 20 };
export function useUserManagement({
  currentUserId,
  onSearchChange = () => undefined,
  search = defaultSearch,
}: UserManagementPageProps) {
  const queryClient = useQueryClient();

  const usersQuery = useQuery(userManagementQueryOptions(search));

  const mutation = useMutation({
    mutationFn: (
      input:
        | { kind: 'status'; userId: string; value: 'ACTIVE' | 'DISABLED' }
        | { kind: 'role'; userId: string; value: 'LEARNER' | 'ADMIN' },
    ) =>
      input.kind === 'status'
        ? changeUserStatus(input.userId, input.value)
        : changeUserRole(input.userId, input.value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: userManagementQueryKey }),
  });

  const changeFilter = (patch: Partial<UserManagementSearch>) =>
    onSearchChange({ ...search, ...patch, page: 1 });
  return {
    currentUserId,
    onSearchChange,
    search,
    usersQuery,
    mutation,
    changeFilter,
  };
}
