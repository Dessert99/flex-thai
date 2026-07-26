/** 관리자 사용자 상태와 non-gating beta 안내 추적 화면을 제공한다 */
import {
  betaInvitationRequestSchema,
  betaInvitationResponseSchema,
  managedIdentityUserResponseSchema,
  userManagementListResponseSchema,
  type ManagedIdentityUserResponse,
} from '@flex-thia/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { authenticatedRequest } from '@/shared/api';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

const userManagementQueryKey = ['admin', 'users'] as const;

/** 사용자 목록·상태 mutation과 beta 안내 발송 기록 form을 렌더링한다 */
export function UserManagementPage() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: userManagementQueryKey,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: '/admin/users',
        response: { kind: 'json', schema: userManagementListResponseSchema },
        signal,
      }),
  });
  const statusMutation = useMutation({
    mutationFn: (user: ManagedIdentityUserResponse) =>
      authenticatedRequest({
        body: {
          status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
        },
        method: 'PATCH',
        path: `/admin/users/${user.id}/status`,
        response: { kind: 'json', schema: managedIdentityUserResponseSchema },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: userManagementQueryKey }),
  });

  if (usersQuery.isPending) {
    return <PageLoading message='사용자를 불러오고 있습니다.' />;
  }
  if (usersQuery.isError || !usersQuery.data) {
    return (
      <PageError
        message='사용자 목록을 불러오지 못했습니다.'
        onRetry={() => void usersQuery.refetch()}
      />
    );
  }

  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>사용자 관리</h1>
      <BetaInvitationForm />
      {statusMutation.isError ? (
        <p
          aria-live='polite'
          className='text-body text-danger'
        >
          사용자 상태를 변경하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <ManagedUserTable
        onChangeStatus={(user) => statusMutation.mutate(user)}
        pending={statusMutation.isPending}
        users={usersQuery.data.items}
      />
    </section>
  );
}

/** beta 안내 발송을 가입 gate와 무관한 기록으로 제출한다 */
function BetaInvitationForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const mutation = useMutation({
    mutationFn: (normalizedEmail: string) =>
      authenticatedRequest({
        body: { email: normalizedEmail },
        method: 'POST',
        path: '/admin/users/invitations',
        response: { kind: 'json', schema: betaInvitationResponseSchema },
      }),
    onSuccess: () => setEmail(''),
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = betaInvitationRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError('학교 이메일을 입력해 주세요.');
      return;
    }
    setError(undefined);
    mutation.mutate(parsed.data.email);
  };

  return (
    <form
      className='grid gap-control rounded-panel border border-default bg-surface p-section'
      noValidate
      onSubmit={onSubmit}
    >
      <label
        className='text-body text-primary'
        htmlFor='beta-invitation-email'
      >
        학교 이메일
      </label>
      <Input
        autoComplete='email'
        id='beta-invitation-email'
        onChange={(event) => setEmail(event.target.value)}
        type='email'
        value={email}
      />
      <p className='text-caption text-subtle'>
        이 기록은 가입 권한을 제한하지 않습니다.
      </p>
      {error ? (
        <p
          aria-live='polite'
          className='text-body text-danger'
        >
          {error}
        </p>
      ) : null}
      {mutation.isError ? (
        <p
          aria-live='polite'
          className='text-body text-danger'
        >
          beta 안내를 기록하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <Button
        disabled={mutation.isPending}
        type='submit'
      >
        {mutation.isPending ? '기록 중' : 'beta 안내 기록'}
      </Button>
    </form>
  );
}

interface ManagedUserTableProps {
  onChangeStatus: (user: ManagedIdentityUserResponse) => void;
  pending: boolean;
  users: ManagedIdentityUserResponse[];
}

/** 공개 사용자 상태와 단일 전이 button을 표로 렌더링한다 */
function ManagedUserTable({
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
          <TableHead>관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.role === 'ADMIN' ? '관리자' : '학습자'}</TableCell>
            <TableCell>
              <Badge
                variant={
                  user.status === 'DISABLED' ? 'destructive' : 'secondary'
                }
              >
                {user.status === 'ACTIVE' ? '활성' : '비활성'}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                disabled={pending}
                onClick={() => onChangeStatus(user)}
                type='button'
                variant='outline'
              >
                {user.status === 'ACTIVE' ? '비활성화' : '활성화'}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
