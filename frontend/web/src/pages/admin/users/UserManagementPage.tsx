import { BetaInvitationForm } from '@/features/identity/components/user-management/BetaInvitationForm';
import { useUserManagement } from '@/features/identity/hooks/user-management/useUserManagement';
import type { UserManagementSearch } from '@/features/identity/libs/user-management/userManagementSearch';
import { isApiError } from '@/shared/apis/ApiError';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Container } from '@/shared/components/layouts/Container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/select';
import { Skeleton } from '@/shared/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/table';
import { type ManagedIdentityUserResponse } from '@flex-thia/contracts/identity/user-management';

/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

interface FilterSelectProps {
  label: string;
  onChange: (value: string) => void;
  value: string;
  values: Array<readonly [string, string]>;
}

/** 공통 필터 선택 UI를 접근 가능한 label과 결합한다 */
function FilterSelect({ label, onChange, value, values }: FilterSelectProps) {
  return (
    <Select
      onValueChange={onChange}
      value={value}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map(([key, text]) => (
          <SelectItem
            key={key}
            value={key}
          >
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 409 안전 정책 오류는 관리자가 바로 이해할 수 있는 문구로 변환한다 */
function getMutationErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (isApiError(error) && error.detail.kind === 'problem') {
    if (error.detail.problem.code === 'SELF_LOCKOUT_FORBIDDEN') {
      return '자신의 관리자 접근 권한은 제거할 수 없습니다.';
    }
    if (error.detail.problem.code === 'LAST_ACTIVE_ADMIN_REQUIRED') {
      return '활성 관리자는 최소 한 명 이상이어야 합니다.';
    }
  }
  return '사용자 정보를 변경하지 못했습니다. 다시 시도해 주세요.';
}

const getMfaFilterValue = (enrolled: boolean | undefined) => {
  if (enrolled === undefined) return 'ALL';
  return enrolled ? 'TRUE' : 'FALSE';
};

const hasFilter = (search: UserManagementSearch) =>
  Boolean(
    search.query ||
    search.role ||
    search.status ||
    search.mfaEnrolled !== undefined,
  );

interface ManagedUserTableProps {
  currentUserId: string | undefined;
  onChangeRole: (user: ManagedIdentityUserResponse) => void;
  onChangeStatus: (user: ManagedIdentityUserResponse) => void;
  pending: boolean;
  users: ManagedIdentityUserResponse[];
}

/** 역할·상태·TOTP와 안전한 변경 action을 표로 렌더링한다 */
function ManagedUserTable({
  currentUserId,
  onChangeRole,
  onChangeStatus,
  pending,
  users,
}: ManagedUserTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>이메일</TableHead>
          <TableHead>역할</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>TOTP</TableHead>
          <TableHead>관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <TableRow key={user.id}>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                {user.role === 'ADMIN' ? '관리자' : '학습자'}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    user.status === 'DISABLED' ? 'destructive' : 'secondary'
                  }
                >
                  {user.status === 'ACTIVE' ? '활성' : '비활성'}
                </Badge>
              </TableCell>
              <TableCell>{getMfaLabel(user)}</TableCell>
              <TableCell className='flex gap-control'>
                <Button
                  disabled={pending || isSelf}
                  onClick={() => onChangeStatus(user)}
                  type='button'
                  variant='outline'
                >
                  {user.status === 'ACTIVE' ? '비활성화' : '활성화'}
                </Button>
                <Button
                  disabled={pending || isSelf}
                  onClick={() => onChangeRole(user)}
                  type='button'
                  variant='outline'
                >
                  {user.role === 'ADMIN' ? '학습자로 변경' : '관리자로 변경'}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

const getMfaLabel = (user: ManagedIdentityUserResponse) => {
  if (user.role === 'LEARNER') return '해당 없음';
  return user.mfaEnrolled ? '등록' : '미등록';
};
export function UserManagementPage(
  pageInput: Parameters<typeof useUserManagement>[0],
) {
  const {
    currentUserId,
    onSearchChange,
    search,
    usersQuery,
    mutation,
    changeFilter,
  } = useUserManagement(pageInput);

  if (usersQuery.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>사용자를 불러오고 있습니다.</p>
          </section>
        </>
      </Container>
    );
  }

  if (usersQuery.isError || !usersQuery.data) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>사용자 목록을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void usersQuery.refetch()}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  const mutationMessage = getMutationErrorMessage(mutation.error);

  return (
    <Container className='max-w-content flex-1'>
      <>
        <section className='grid gap-section'>
          <h1 className='text-title text-primary'>사용자 관리</h1>
          <BetaInvitationForm />
          <div className='grid gap-control md:grid-cols-4'>
            <Input
              aria-label='이메일 검색'
              onChange={(event) =>
                changeFilter({ query: event.target.value || undefined })
              }
              placeholder='이메일 검색'
              value={search.query ?? ''}
            />
            <FilterSelect
              label='역할 필터'
              onChange={(value) =>
                changeFilter({
                  role:
                    value === 'ALL'
                      ? undefined
                      : (value as 'LEARNER' | 'ADMIN'),
                })
              }
              value={search.role ?? 'ALL'}
              values={[
                ['ALL', '모든 역할'],
                ['LEARNER', '학습자'],
                ['ADMIN', '관리자'],
              ]}
            />
            <FilterSelect
              label='상태 필터'
              onChange={(value) =>
                changeFilter({
                  status:
                    value === 'ALL'
                      ? undefined
                      : (value as 'ACTIVE' | 'DISABLED'),
                })
              }
              value={search.status ?? 'ALL'}
              values={[
                ['ALL', '모든 상태'],
                ['ACTIVE', '활성'],
                ['DISABLED', '비활성'],
              ]}
            />
            <FilterSelect
              label='TOTP 필터'
              onChange={(value) =>
                changeFilter({
                  mfaEnrolled: value === 'ALL' ? undefined : value === 'TRUE',
                })
              }
              value={getMfaFilterValue(search.mfaEnrolled)}
              values={[
                ['ALL', '모든 TOTP'],
                ['TRUE', '등록'],
                ['FALSE', '미등록'],
              ]}
            />
          </div>
          {mutationMessage ? (
            <p
              aria-live='polite'
              className='text-body text-danger'
            >
              {mutationMessage}
            </p>
          ) : null}
          {usersQuery.data.items.length === 0 ? (
            <p>
              {hasFilter(search)
                ? '조건에 맞는 사용자가 없습니다.'
                : '사용자가 없습니다.'}
            </p>
          ) : (
            <ManagedUserTable
              currentUserId={currentUserId}
              onChangeRole={(user) =>
                mutation.mutate({
                  kind: 'role',
                  userId: user.id,
                  value: user.role === 'ADMIN' ? 'LEARNER' : 'ADMIN',
                })
              }
              onChangeStatus={(user) =>
                mutation.mutate({
                  kind: 'status',
                  userId: user.id,
                  value: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                })
              }
              pending={mutation.isPending}
              users={usersQuery.data.items}
            />
          )}
          <div className='flex items-center gap-control'>
            <Button
              disabled={search.page <= 1}
              onClick={() =>
                onSearchChange({ ...search, page: search.page - 1 })
              }
              variant='outline'
            >
              이전
            </Button>
            <span>
              {search.page} / {Math.max(usersQuery.data.page.totalPages, 1)}
            </span>
            <Button
              disabled={search.page >= usersQuery.data.page.totalPages}
              onClick={() =>
                onSearchChange({ ...search, page: search.page + 1 })
              }
              variant='outline'
            >
              다음
            </Button>
          </div>
        </section>
      </>
    </Container>
  );
}
