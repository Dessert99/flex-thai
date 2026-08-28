/** 서버 logout 성공을 확인한 뒤에만 로그인 route로 이동한다 */
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { logoutSession } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { SidebarMenuButton, SidebarMenuItem } from '@/shared/ui/sidebar';

/** pending·실패 feedback을 제공하는 SPA logout 버튼 */
export function LogoutButton({
  appearance = 'button',
}: {
  appearance?: 'button' | 'sidebar';
}) {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: logoutSession,
    onSuccess() {
      void navigate({ replace: true, to: '/login' });
    },
  });

  if (appearance === 'sidebar') {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          tooltip='로그아웃'
          type='button'
        >
          <LogOut />
          <span>{mutation.isPending ? '로그아웃 중' : '로그아웃'}</span>
        </SidebarMenuButton>
        {mutation.isError ? (
          <p
            aria-live='polite'
            className='px-cluster text-caption text-danger group-data-[collapsible=icon]:hidden'
          >
            로그아웃하지 못했습니다. 다시 시도해 주세요.
          </p>
        ) : null}
      </SidebarMenuItem>
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
