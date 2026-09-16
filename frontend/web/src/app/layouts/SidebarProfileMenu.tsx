/** 사이드바 아바타에서 개인 학습 메뉴와 로그아웃을 제공한다 */
import { Link } from '@tanstack/react-router';
import { Bookmark, ChevronsUpDown, History, Library } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/shared/ui/sidebar';

interface SidebarProfileMenuProps {
  identity: { email: string; role: 'ADMIN' | 'LEARNER' };
  children?: ReactNode;
}

export function SidebarProfileMenu({
  identity,
  children,
}: SidebarProfileMenuProps) {
  const { isMobile } = useSidebar();
  const role = identity.role === 'ADMIN' ? '관리자' : '학습자';
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            aria-label='프로필 메뉴'
            size='lg'
            tooltip='프로필 메뉴'
            className='group-data-[collapsible=icon]:p-none!'
          >
            <ProfileAvatar />
            <span className='grid min-w-none flex-1 text-left text-caption group-data-[collapsible=icon]:hidden'>
              <span className='truncate font-semibold'>
                {identity.email.split('@')[0]}
              </span>
              <span className='truncate text-muted-foreground'>
                {identity.email}
              </span>
            </span>
            <ChevronsUpDown className='ml-auto group-data-[collapsible=icon]:hidden' />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          side={isMobile ? 'bottom' : 'right'}
          className='w-profile-menu'
        >
          <DropdownMenuLabel>
            <div className='flex items-center gap-cluster'>
              <ProfileAvatar />
              <div className='grid min-w-none text-caption'>
                <span>{role}</span>
                <span className='truncate font-normal text-muted-foreground'>
                  {identity.email}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to='/wordbooks'>
                <Library />내 단어장
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to='/history'>
                <History />
                나의 학습 기록
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to='/questions'
                search={{ saved: true, page: 1, pageSize: 20 }}
              >
                <Bookmark />
                저장한 문제
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {children ? (
            <>
              <DropdownMenuSeparator />
              {children}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function ProfileAvatar() {
  return (
    <Avatar className='size-avatar!'>
      <AvatarImage
        src='/images/hufs.svg'
        alt='기본 프로필'
      />
      <AvatarFallback>HU</AvatarFallback>
    </Avatar>
  );
}
