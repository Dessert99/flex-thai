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
    expect(screen.getByRole('link', { name: '내 단어장' })).toHaveAttribute(
      'href',
      '/wordbooks',
    );
    expect(screen.getByRole('link', { name: '단어 연습' })).toHaveAttribute(
      'href',
      '/practice',
    );
    expect(screen.getByRole('link', { name: '개념 학습' })).toHaveAttribute(
      'href',
      '/concepts?category=GRAMMAR',
    );
    expect(
      screen.queryByRole('link', { name: '저장한 어휘' }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: '사용자 관리' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: '개념 관리' })).toHaveAttribute(
      'href',
      '/admin/concepts',
    );
    expect(
      screen.queryByRole('link', { name: '학습 홈' }),
    ).not.toBeInTheDocument();
  });
});
