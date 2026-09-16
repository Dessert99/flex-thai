/** SidebarLayout의 landmark와 shadcn Sidebar 내비게이션 경계를 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { House, Search } from 'lucide-react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SidebarLayout } from './SidebarLayout';

const navigation = [
  { group: '메뉴', href: '/dashboard', icon: House, label: '대시보드' },
  { group: '메뉴', href: '/study', icon: Search, label: '학습' },
];

beforeEach(() => {
  setViewportWidth(1280);
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
