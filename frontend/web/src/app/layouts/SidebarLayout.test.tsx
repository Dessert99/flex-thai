/** SidebarLayout의 landmark와 shadcn Sidebar 내비게이션 경계를 검증한다 */
import { renderWithProviders as render } from '@/shared/test/renderWithProviders';
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
import { adminNavigation } from '../routing/adminNavigation';
import { learnerNavigation } from '../routing/learnerNavigation';

const navigation = [
  { group: '메뉴', href: '/dashboard', icon: House, label: '대시보드' },
  { group: '메뉴', href: '/study', icon: Search, label: '학습' },
];

beforeEach(() => {
  setViewportWidth(1280);
});

describe('SidebarLayout 화면 전환', () => {
  it('메뉴 클릭을 라우터가 처리하고 검색 조건과 사이드바를 유지한다', async () => {
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
    const users = createRoute({
      getParentRoute: () => root,
      path: '/admin/users',
      component: () => <p>사용자 관리 화면</p>,
    });
    const wordbooks = createRoute({
      getParentRoute: () => root,
      path: '/wordbooks',
      component: () => <p>개인 단어장 화면</p>,
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/learn'] }),
      routeTree: root.addChildren([home, concepts, users, wordbooks]),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    const user = userEvent.setup();
    await screen.findByText('학습 시작 화면');
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
    await user.click(screen.getByRole('link', { name: '사용자 관리' }));
    await screen.findByText('사용자 관리 화면');
    expect(router.state.location.pathname).toBe('/admin/users');
    expect(desktopSidebar()).toBe(sidebar);
    expect(sidebar).toHaveAttribute('data-state', 'expanded');
    await user.click(screen.getByRole('link', { name: '학습 홈' }));
    await screen.findByText('학습 시작 화면');
    expect(desktopSidebar()).toBe(sidebar);
    expect(
      screen.queryByRole('link', { name: '내 단어장' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '프로필 메뉴' }));
    expect(
      screen.getByRole('menuitem', { name: '나의 학습 기록' }),
    ).toHaveAttribute('href', '/history');
    expect(
      screen.getByRole('menuitem', { name: '저장한 문제' }),
    ).toHaveAttribute('href', '/questions?saved=true&page=1&pageSize=20');
    await user.click(screen.getByRole('menuitem', { name: '내 단어장' }));
    await screen.findByText('개인 단어장 화면');
    expect(router.state.location.pathname).toBe('/wordbooks');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(desktopSidebar()).toBe(sidebar);
  });
});

describe('SidebarLayout', () => {
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

  it('프로필 메뉴를 열면 추가 계정 동작을 표시한다', async () => {
    render(
      <SidebarLayout
        currentPath='/study'
        navigation={navigation}
        identity={{ email: 'learner@example.com', role: 'LEARNER' }}
        profileMenu={<button type='button'>프로필</button>}
      >
        본문
      </SidebarLayout>,
    );

    expect(screen.getByRole('link', { name: '학습' })).toHaveAttribute(
      'href',
      '/study',
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '프로필 메뉴' }));
    expect(screen.getByRole('button', { name: '프로필' })).toBeInTheDocument();
  });
});

function NavigationShell() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <SidebarLayout
      currentPath={path}
      navigation={learnerNavigation}
      adminNavigation={adminNavigation}
      identity={{ email: 'admin@example.com', role: 'ADMIN' }}
    >
      <Outlet />
    </SidebarLayout>
  );
}

describe('SidebarLayout 계정 영역', () => {
  it('관리자 계정과 운영자 섹션을 표시한다', () => {
    render(
      <SidebarLayout
        currentPath='/dashboard'
        identity={{ email: 'admin@example.com', role: 'ADMIN' }}
        navigation={navigation}
        adminNavigation={adminNavigation}
      >
        관리자 본문
      </SidebarLayout>,
    );

    expect(screen.getByText('admin@example.com')).toBeVisible();
    expect(screen.getByRole('button', { name: '프로필 메뉴' })).toBeVisible();
    expect(screen.getByRole('link', { name: '사용자 관리' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
  });

  it('학습자 계정에는 운영자 섹션을 표시하지 않는다', () => {
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
    expect(screen.getByRole('button', { name: '프로필 메뉴' })).toBeVisible();
    expect(
      screen.queryByRole('region', { name: '운영자 기능' }),
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

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}
