/** 사이드바와 Provider만 공유하고 페이지 본문 배치는 각 페이지가 소유한다 */
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { SidebarProfileMenu } from './SidebarProfileMenu';
import type { ReactNode } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useFloatingSidebar } from './useFloatingSidebar';
import './SidebarLayout.css';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
  profileMenu?: ReactNode;
}

/** 모바일 Sheet와 본문 위로 펼쳐지는 데스크톱 사이드바를 조합한다. */
export function SidebarLayout({
  children,
  currentPath,
  identity,
  navigation,
  profileMenu,
}: SidebarLayoutProps) {
  const isMobile = useIsMobile();
  const { open, changeOpen, panelRef, panelEvents, onProfileOpenChange } =
    useFloatingSidebar(isMobile);
  const activeHref = findActiveHref(currentPath, navigation);
  const home = navigation[0];

  return (
    <SidebarProvider
      open={open}
      onOpenChange={changeOpen}
      className='app-sidebar-wrapper'
    >
      <Sidebar
        ref={isMobile ? undefined : panelRef}
        variant='floating'
        collapsible='icon'
        {...(isMobile ? {} : panelEvents)}
      >
        <AppSidebarHeader homeHref={home?.href ?? '/'} />

        <SidebarContent>
          <AppNavigation
            activeHref={activeHref}
            navigation={navigation}
          />
        </SidebarContent>

        <SidebarFooter className='border-t border-sidebar-border'>
          <SidebarMenu>
            {identity ? (
              <SidebarProfileMenu
                identity={identity}
                onOpenChange={onProfileOpenChange}
              >
                {profileMenu}
              </SidebarProfileMenu>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset
        id='app-main'
        className='min-w-none'
      >
        <MobileSidebarTrigger />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppSidebarHeader({ homeHref }: { homeHref: string }) {
  const { isMobile, open } = useSidebar();
  return (
    <SidebarHeader className='border-b border-sidebar-border'>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            size='lg'
            className='app-sidebar-home'
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
        <SidebarMenuItem className={isMobile ? '' : 'app-sidebar-touch-toggle'}>
          <SidebarTrigger
            aria-label={isMobile ? '사이드바 닫기' : '사이드바 펼침 전환'}
            aria-expanded={isMobile || open}
          />
        </SidebarMenuItem>
      </SidebarMenu>
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
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <nav aria-label={label}>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {navigation.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  className='data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:hover:bg-sidebar-primary/90'
                  isActive={item.href === activeHref}
                >
                  <Link
                    to={item.href}
                    search={item.search ?? {}}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
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
    </nav>
  );
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
