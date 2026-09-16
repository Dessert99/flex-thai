/** 공통 학습 메뉴와 관리자 전용 운영자 영역의 접근·배치를 검증한다 */
import { renderWithProviders as render } from '@/shared/test';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarLayout } from '../layouts/SidebarLayout';
import { adminNavigation } from './adminNavigation';
import { learnerNavigation } from './learnerNavigation';

describe('역할별 내비게이션', () => {
  it('학습자는 공통 메뉴만 보며 운영자 항목은 노출하지 않는다', () => {
    render(
      <SidebarLayout
        currentPath='/learn'
        navigation={learnerNavigation}
        adminNavigation={adminNavigation}
        identity={{ email: 'learner@example.com', role: 'LEARNER' }}
      >
        학습자 본문
      </SidebarLayout>,
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('학습자 본문');
    expect(screen.getByRole('link', { name: '학습 홈' })).toHaveAttribute(
      'href',
      '/learn',
    );
    expect(
      screen.queryByRole('link', { name: '내 단어장' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '개념 학습' })).toHaveAttribute(
      'href',
      '/concepts?category=GRAMMAR',
    );
    expect(
      screen.queryByRole('region', { name: '운영자 기능' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '사용자 관리' }),
    ).not.toBeInTheDocument();
  });

  it.each(['/learn', '/admin/users'])(
    '%s에서도 관리자는 학습 메뉴 아래에 운영자 영역을 본다',
    (path) => {
      render(
        <SidebarLayout
          currentPath={path}
          identity={{ email: 'admin@example.com', role: 'ADMIN' }}
          navigation={learnerNavigation}
          adminNavigation={adminNavigation}
        >
          관리자 본문
        </SidebarLayout>,
      );
      const common = screen.getByRole('navigation', { name: '주요 메뉴' });
      const operator = screen.getByRole('region', { name: '운영자 기능' });
      expect(
        within(common).getByRole('link', { name: '학습 홈' }),
      ).toBeVisible();
      expect(
        within(common).queryByRole('link', { name: '사용자 관리' }),
      ).not.toBeInTheDocument();
      expect(
        within(operator).getByRole('link', { name: '사용자 관리' }),
      ).toHaveAttribute('href', '/admin/users');
      expect(
        within(operator).getByRole('link', { name: '문제 관리' }),
      ).toHaveAttribute('href', '/admin/questions');
      expect(
        within(operator).getByRole('link', { name: '감사 기록' }),
      ).toHaveAttribute('href', '/admin/audit-logs');
      expect(
        within(operator).queryByRole('link', { name: '학습 홈' }),
      ).not.toBeInTheDocument();
      expect(
        common.compareDocumentPosition(operator) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.getByRole('link', {
          name: path === '/learn' ? '학습 홈' : '사용자 관리',
        }),
      ).toHaveAttribute('data-active', 'true');
      expect(screen.getAllByRole('main')).toHaveLength(1);
    },
  );
});
