/** 사이드바와 Provider만 공유하고 페이지 본문 배치는 각 페이지가 소유한다 */
import {
  ArrowLeftRight,
  CircleUserRound,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
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
  SidebarRail,
  SidebarTrigger,
} from '@/shared/ui/sidebar';

/** SidebarLayout이 렌더링할 도메인 중립 내비게이션 항목 */
export interface SidebarLayoutNavigationItem {
  group?: string;
  href: string;
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
  portalLink?: {
    href: string;
    label: string;
  };
  profileMenu?: ReactNode;
}

/** 모바일 Sheet와 데스크톱 icon collapse를 공유하는 사이드바 레이아웃 */
export function SidebarLayout({
  children,
  currentPath,
  identity,
  navigation,
  portalLink,
  profileMenu,
}: SidebarLayoutProps) {
  const activeHref = findActiveHref(currentPath, navigation);
  const home = navigation[0];

  return (
    <SidebarProvider>
      <Sidebar collapsible='icon'>
        <SidebarHeader className='border-b border-sidebar-border'>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className='[&>svg]:text-sidebar-primary'
                size='lg'
                tooltip='FLEX THIA'
              >
                <a href={home?.href ?? '/'}>
                  <GraduationCap />
                  <span className='font-semibold'>FLEX THIA</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <AppNavigation
            activeHref={activeHref}
            navigation={navigation}
          />
        </SidebarContent>

        <SidebarFooter className='border-t border-sidebar-border'>
          <SidebarMenu>
            {identity ? <IdentityItem identity={identity} /> : null}
            {portalLink ? <PortalItem portalLink={portalLink} /> : null}
            {profileMenu}
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail aria-label='사이드바 열기 또는 접기' />
      </Sidebar>

      <SidebarInset id='app-main'>
        <SidebarTrigger
          aria-label='사이드바 열기 또는 접기'
          className='m-cluster'
        />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppNavigation({
  activeHref,
  navigation,
}: {
  activeHref: string | undefined;
  navigation: readonly SidebarLayoutNavigationItem[];
}) {
  return (
    <nav aria-label='주요 메뉴'>
      {groupNavigation(navigation).map(([group, items]) => (
        <SidebarGroup key={group}>
          <SidebarGroupLabel>{group}</SidebarGroupLabel>
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
                    <a href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
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

function IdentityItem({
  identity,
}: {
  identity: NonNullable<SidebarLayoutProps['identity']>;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className='cursor-default'
        size='lg'
        tooltip={identity.email}
      >
        <div>
          <CircleUserRound />
          <span className='grid flex-1 text-left text-caption leading-tight'>
            <span className='truncate font-medium'>{identity.email}</span>
            <span className='truncate text-caption text-sidebar-foreground/70'>
              {identity.role === 'ADMIN' ? '관리자' : '학습자'}
            </span>
          </span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function PortalItem({
  portalLink,
}: {
  portalLink: NonNullable<SidebarLayoutProps['portalLink']>;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={portalLink.label}
      >
        <a href={portalLink.href}>
          <ArrowLeftRight />
          <span>{portalLink.label}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
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
