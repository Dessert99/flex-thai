/** SidebarLayout의 landmark와 shadcn Sidebar 내비게이션 경계를 검증한다 */
import { renderWithProviders as render } from '@/shared/test';
import { fireEvent, screen } from '@testing-library/react';
import { House, Search } from 'lucide-react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SidebarLayout } from './SidebarLayout';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { learnerNavigation } from '../routing/learnerNavigation';

const navigation = [
  { group: '메뉴', href: '/dashboard', icon: House, label: '대시보드' },
  { group: '메뉴', href: '/study', icon: Search, label: '학습' },
];

beforeEach(() => {
  setViewportWidth(1280);
});

describe('SidebarLayout', () => {
  it('메뉴 클릭을 라우터가 처리하고 검색 조건과 접힌 사이드바를 유지한다', async () => {
    const root = createRootRoute({ component: NavigationShell });
    const home = createRoute({
      getParentRoute: () => root,
      path: '/learn',
      component: () => <p>학습 시작 화면</p>,
    });
    const concepts = createRoute({
      getParentRoute: () => root,
      path: '/concepts',
      component: () => <p>개념 목록 화면</p>,
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/learn'] }),
      routeTree: root.addChildren([home, concepts]),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    const user = userEvent.setup();
    await screen.findByText('학습 시작 화면');
    await user.click(sidebarTrigger());
    const sidebar = desktopSidebar();
    const main = screen.getByRole('main');
    const link = screen.getByRole('link', { name: '개념 학습' });
    // 일반 anchor는 기본 문서 이동을 취소하지 않아 이 검증을 통과할 수 없다.
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    await screen.findByText('개념 목록 화면');
    expect(router.state.location.pathname).toBe('/concepts');
    expect(router.state.location.search).toEqual({ category: 'GRAMMAR' });
    expect(desktopSidebar()).toBe(sidebar);
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    expect(screen.getByRole('main')).toBe(main);
  });

  it('주요 메뉴와 단일 main landmark를 제공한다', () => {
    render(
      <SidebarLayout
        currentPath='/dashboard'
        navigation={navigation}
      >
        본문
      </SidebarLayout>,
    );

    expect(
      screen.getByRole('navigation', { name: '주요 메뉴' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('본문');
  });

  it('가장 구체적인 현재 경로를 활성 메뉴로 표시한다', () => {
    render(
      <SidebarLayout
        currentPath='/study/session-1'
        navigation={navigation}
      >
        본문
      </SidebarLayout>,
    );

    expect(screen.getByRole('link', { name: '학습' })).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute(
      'data-active',
      'false',
    );
  });

  it('트리거로 데스크톱 Sidebar를 아이콘 형태로 접는다', () => {
    render(
      <SidebarLayout
        currentPath='/dashboard'
        navigation={navigation}
      >
        본문
      </SidebarLayout>,
    );

    expect(desktopSidebar()).toHaveAttribute('data-state', 'expanded');
    fireEvent.click(sidebarTrigger());
    expect(desktopSidebar()).toHaveAttribute('data-state', 'collapsed');
    expect(desktopSidebar()).toHaveAttribute('data-collapsible', 'icon');
  });

  it('내비게이션 링크와 선택적인 프로필 메뉴를 노출한다', () => {
    render(
      <SidebarLayout
        currentPath='/study'
        navigation={navigation}
        profileMenu={<button type='button'>프로필</button>}
      >
        본문
      </SidebarLayout>,
    );

    expect(screen.getByRole('link', { name: '학습' })).toHaveAttribute(
      'href',
      '/study',
    );
    expect(screen.getByRole('button', { name: '프로필' })).toBeInTheDocument();
  });
});

function NavigationShell() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <SidebarLayout
      currentPath={path}
      navigation={learnerNavigation}
    >
      <Outlet />
    </SidebarLayout>
  );
}

describe('SidebarLayout 계정 영역', () => {
  it('관리자 계정과 학습자 portal link를 Sidebar Footer에 표시한다', () => {
    render(
      <SidebarLayout
        currentPath='/dashboard'
        identity={{ email: 'admin@example.com', role: 'ADMIN' }}
        navigation={navigation}
        portalLink={{ href: '/learn', label: '학습자 포털' }}
      >
        관리자 본문
      </SidebarLayout>,
    );

    expect(screen.getByText('admin@example.com')).toBeVisible();
    expect(screen.getByText('관리자')).toBeVisible();
    expect(screen.getByRole('link', { name: '학습자 포털' })).toHaveAttribute(
      'href',
      '/learn',
    );
  });

  it('학습자 계정을 표시하고 관리자 portal link는 만들지 않는다', () => {
    render(
      <SidebarLayout
        currentPath='/dashboard'
        identity={{ email: 'learner@example.com', role: 'LEARNER' }}
        navigation={navigation}
      >
        학습자 본문
      </SidebarLayout>,
    );

    expect(screen.getByText('learner@example.com')).toBeVisible();
    expect(screen.getByText('학습자')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: '관리자 포털' }),
    ).not.toBeInTheDocument();
  });
});

function desktopSidebar(): HTMLElement {
  const sidebar = document.querySelector<HTMLElement>(
    '[data-slot="sidebar"][data-state]',
  );
  if (!sidebar) throw new Error('데스크톱 Sidebar가 필요합니다.');
  return sidebar;
}

function sidebarTrigger(): HTMLElement {
  const trigger = screen
    .getAllByRole('button', { name: '사이드바 열기 또는 접기' })
    .at(0);
  if (!trigger) throw new Error('Sidebar trigger가 필요합니다.');
  return trigger;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}
