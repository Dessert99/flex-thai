import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House, Search } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders as render } from '@/shared/test/renderWithProviders';
import { SidebarLayout } from './SidebarLayout';

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1280,
  });
});
afterEach(() => vi.useRealTimers());

function renderSidebar() {
  return render(
    <SidebarLayout
      currentPath='/learn'
      navigation={[
        { href: '/learn', label: '학습 홈', icon: House },
        { href: '/study', label: '학습', icon: Search },
      ]}
      identity={{ email: 'learner@example.com', role: 'LEARNER' }}
    >
      <button type='button'>본문 버튼</button>
    </SidebarLayout>,
  );
}

function sidebar() {
  const element = document.querySelector<HTMLElement>(
    '[data-slot="sidebar"][data-state]',
  );
  if (!element) throw new Error('Sidebar가 필요합니다.');
  return element;
}
function panel() {
  const element = document.querySelector<HTMLElement>(
    '[data-slot="sidebar-container"]',
  );
  if (!element) throw new Error('Sidebar panel이 필요합니다.');
  return element;
}
function advanceClose() {
  act(() => {
    vi.advanceTimersByTime(150);
  });
}

describe('floating 사이드바', () => {
  it('아이콘 바로 시작하며 호버 시 본문과 spacer를 유지한 채 펼친다', () => {
    renderSidebar();
    const main = screen.getByRole('main');
    const gap = document.querySelector('[data-slot="sidebar-gap"]');
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
    expect(sidebar()).toHaveAttribute('data-variant', 'floating');
    expect(
      screen.getByRole('link', { name: '홈으로 이동' }),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(panel(), { pointerType: 'mouse' });
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    expect(screen.getByRole('main')).toBe(main);
    expect(document.querySelector('[data-slot="sidebar-gap"]')).toBe(gap);
  });

  it('영역을 벗어난 150ms 뒤 접고 재진입하면 접기를 취소한다', () => {
    vi.useFakeTimers();
    renderSidebar();
    fireEvent.pointerEnter(panel());
    fireEvent.pointerLeave(panel());
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    fireEvent.pointerEnter(panel());
    advanceClose();
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    fireEvent.pointerLeave(panel());
    advanceClose();
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
  });

  it('키보드 포커스가 있으면 유지하고 본문으로 이동하면 접는다', () => {
    vi.useFakeTimers();
    renderSidebar();
    act(() => screen.getByRole('link', { name: '학습' }).focus());
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    fireEvent.pointerLeave(panel());
    advanceClose();
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    act(() => screen.getByRole('button', { name: '본문 버튼' }).focus());
    advanceClose();
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
  });

  it('Escape로 닫은 뒤 내부 포커스 이동으로 다시 열지 않는다', () => {
    renderSidebar();
    act(() => screen.getByRole('link', { name: '학습 홈' }).focus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
    act(() => screen.getByRole('link', { name: '학습' }).focus());
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
    fireEvent.pointerEnter(panel());
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
  });

  it('프로필 팝업으로 이동해도 유지하고 Escape는 팝업부터 닫는다', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole('button', { name: '프로필 메뉴' }));
    fireEvent.pointerLeave(panel());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    await user.keyboard('{Escape}');
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
  });

  it('펼침 버튼과 단축키를 지원하고 바깥 터치로 닫는다', async () => {
    renderSidebar();
    await userEvent
      .setup({ skipHover: true })
      .click(screen.getByRole('button', { name: '사이드바 펼침 전환' }));
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    fireEvent.pointerDown(screen.getByRole('button', { name: '본문 버튼' }));
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
  });

  it('모바일에서는 버튼으로 Sheet를 열고 메뉴 선택으로 닫는다', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    renderSidebar();
    const user = userEvent.setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '사이드바 열기' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '학습' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
