/** 사이드바와 Provider만 공유하고 페이지 본문 배치는 각 페이지가 소유한다 */
import { Link } from '@tanstack/react-router';
import { PanelLeft, type LucideIcon } from 'lucide-react';
import { SidebarProfileMenu } from './SidebarProfileMenu';
import type { ReactNode } from 'react';
import { Button } from '@/shared/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/tooltip';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/shared/components/sidebar';

/** SidebarLayout이 렌더링할 도메인 중립 내비게이션 항목 */
export interface SidebarLayoutNavigationItem {
  group?: string;
  href: string;
  search?: Record<string, string | number | boolean>;
  icon: LucideIcon;
  label: string;
}

/** SidebarLayout의 내비게이션·본문·선택 프로필 슬롯 */
export interface SidebarLayoutProps {
  children: ReactNode;
  currentPath: string;
  identity?: {
    email: string;
    role: 'ADMIN' | 'LEARNER';
  };
  navigation: readonly SidebarLayoutNavigationItem[];
  adminNavigation?: readonly SidebarLayoutNavigationItem[];
  profileMenu?: ReactNode;
}

/** 모바일 Sheet와 데스크톱 icon collapse를 공유하는 사이드바 레이아웃 */
export function SidebarLayout({
  children,
  currentPath,
  identity,
  navigation,
  adminNavigation = [],
  profileMenu,
}: SidebarLayoutProps) {
  const activeHref = findActiveHref(currentPath, [
    ...navigation,
    ...adminNavigation,
  ]);
  const home = navigation[0];

  return (
    <SidebarProvider>
      <Sidebar collapsible='icon'>
        <AppSidebarHeader homeHref={home?.href ?? '/'} />

        <SidebarContent>
          <AppNavigation
            activeHref={activeHref}
            navigation={navigation}
          />
          {identity?.role === 'ADMIN' && adminNavigation.length > 0 ? (
            <section
              aria-label='운영자 기능'
              className='mt-cluster flex-1 border-t border-operator-border bg-operator-surface'
            >
              <h2 className='p-cluster text-caption font-semibold text-foreground group-data-[collapsible=icon]:sr-only'>
                운영자 기능
              </h2>
              <AppNavigation
                activeHref={activeHref}
                navigation={adminNavigation}
                label='운영자 메뉴'
              />
            </section>
          ) : null}
        </SidebarContent>

        <SidebarFooter className='border-t border-sidebar-border'>
          <SidebarMenu>
            {identity ? (
              <SidebarProfileMenu identity={identity}>
                {profileMenu}
              </SidebarProfileMenu>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset id='app-main'>
        <MobileSidebarTrigger />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppSidebarHeader({ homeHref }: { homeHref: string }) {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';
  const label = collapsed ? '사이드바 열기' : '사이드바 접기';

  return (
    <SidebarHeader className='flex-row py-cluster items-center justify-between border-b border-sidebar-border'>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='group/logo relative h-control w-avatar shrink-0'
              aria-label={label}
              aria-expanded={false}
              onClick={toggleSidebar}
            >
              <img
                src='/images/thai-flag.png'
                alt=''
                className='size-avatar rounded-full object-cover group-hover/logo:opacity-0 group-focus-visible/logo:opacity-0'
              />
              <PanelLeft className='absolute opacity-0 group-hover/logo:opacity-100 group-focus-visible/logo:opacity-100' />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side='right'
            sideOffset={8}
          >
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        <>
          <SidebarMenu className='w-auto'>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size='lg'
                tooltip='학습 홈'
              >
                <Link
                  to={homeHref}
                  aria-label='홈으로 이동'
                >
                  <img
                    src='/images/thai-flag.png'
                    alt=''
                    className='size-avatar shrink-0 rounded-full object-cover'
                  />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger
                aria-label={label}
                aria-expanded={true}
                className='shrink-0'
              />
            </TooltipTrigger>
            <TooltipContent
              side='right'
              sideOffset={8}
            >
              {label}
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </SidebarHeader>
  );
}

function MobileSidebarTrigger() {
  const { isMobile, openMobile } = useSidebar();
  return isMobile ? (
    <SidebarTrigger
      aria-label='사이드바 열기'
      aria-expanded={openMobile}
      className='m-cluster'
    />
  ) : null;
}

function AppNavigation({
  activeHref,
  navigation,
  label = '주요 메뉴',
}: {
  activeHref: string | undefined;
  label?: string;
  navigation: readonly SidebarLayoutNavigationItem[];
}) {
  return (
    <nav aria-label={label}>
      {groupNavigation(navigation).map(([group, items]) => (
        <SidebarGroup key={group}>
          <SidebarGroupLabel className='group-data-[collapsible=icon]:pointer-events-none'>
            {group}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    className='data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:hover:bg-sidebar-primary/90'
                    isActive={item.href === activeHref}
                    tooltip={item.label}
                  >
                    <Link
                      to={item.href}
                      search={item.search ?? {}}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}

function groupNavigation(
  navigation: readonly SidebarLayoutNavigationItem[],
): Array<[string, SidebarLayoutNavigationItem[]]> {
  const groups = new Map<string, SidebarLayoutNavigationItem[]>();
  for (const item of navigation) {
    const group = item.group ?? '메뉴';
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return [...groups.entries()];
}

/** 가장 구체적인 상위 경로 하나만 활성 메뉴로 선택한다 */
export function findActiveHref(
  currentPath: string,
  navigation: readonly SidebarLayoutNavigationItem[],
): string | undefined {
  return navigation
    .filter(({ href }) => {
      const path = href.split('?')[0];
      return (
        path !== undefined &&
        (currentPath === path || currentPath.startsWith(`${path}/`))
      );
    })
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
}
