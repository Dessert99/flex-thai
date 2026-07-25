/** 역할별 shell이 분리된 내비게이션과 landmark를 제공하는지 검증한다 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '@/shared/ui/app-shell';
import { adminNavigation } from './adminNavigation';
import { learnerNavigation } from './learnerNavigation';

describe('역할별 내비게이션', () => {
  it('학습자 전용 주요 메뉴와 main landmark를 제공한다', () => {
    render(<AppShell navigation={learnerNavigation}>학습자 본문</AppShell>);

    expect(
      screen.getByRole('navigation', { name: '주요 메뉴' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('학습자 본문');
    expect(screen.getByRole('link', { name: '학습 홈' })).toHaveAttribute(
      'href',
      '/learn',
    );
    expect(
      screen.queryByRole('link', { name: '콘텐츠 가져오기' }),
    ).not.toBeInTheDocument();
  });

  it('관리자 전용 주요 메뉴와 main landmark를 제공한다', () => {
    render(<AppShell navigation={adminNavigation}>관리자 본문</AppShell>);

    expect(screen.getByRole('main')).toHaveTextContent('관리자 본문');
    expect(screen.getByRole('link', { name: '관리 홈' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(
      screen.getByRole('link', { name: '콘텐츠 가져오기' }),
    ).toHaveAttribute('href', '/admin/content-imports');
    expect(
      screen.queryByRole('link', { name: '학습 홈' }),
    ).not.toBeInTheDocument();
  });
});
