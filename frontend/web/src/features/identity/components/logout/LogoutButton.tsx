/** 서버 logout 성공을 확인한 뒤에만 로그인 route로 이동한다 */
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { logoutSession } from '@/shared/apis/auth/authSessionStore';
import { Button } from '@/shared/components/button';
import { DropdownMenuItem } from '@/shared/components/dropdown-menu';

/** pending·실패 feedback을 제공하는 SPA logout 버튼 */
export function LogoutButton({
  appearance = 'button',
}: {
  appearance?: 'button' | 'menu';
}) {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: logoutSession,
    onSuccess() {
      void navigate({ replace: true, to: '/login' });
    },
  });

  if (appearance === 'menu') {
    return (
      <>
        <DropdownMenuItem
          disabled={mutation.isPending}
          onSelect={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <LogOut />
          <span>{mutation.isPending ? '로그아웃 중' : '로그아웃'}</span>
        </DropdownMenuItem>
        {mutation.isError ? (
          <p
            role='alert'
            className='p-cluster text-caption text-danger'
          >
            로그아웃하지 못했습니다. 다시 시도해 주세요.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className='flex flex-col gap-cluster'>
      <Button
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        type='button'
        variant='outline'
      >
        {mutation.isPending ? '로그아웃 중' : '로그아웃'}
      </Button>
      {mutation.isError ? (
        <p
          aria-live='polite'
          className='text-caption text-danger'
        >
          로그아웃하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  );
}
