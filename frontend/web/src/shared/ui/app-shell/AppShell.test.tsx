/** AppShell의 landmark와 도메인 중립 내비게이션 경계를 검증한다 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

const navigation = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/study', label: '학습' },
];

describe('AppShell', () => {
  it('모바일에서 내비게이션 이름과 본문 landmark를 제공한다', () => {
    render(<AppShell navigation={navigation}>본문</AppShell>);

    expect(
      screen.getByRole('navigation', { name: '주요 메뉴' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('본문');
  });

  it('내비게이션 링크와 선택적인 프로필 메뉴를 노출한다', () => {
    render(
      <AppShell
        navigation={navigation}
        profileMenu={<button type='button'>프로필</button>}
      >
        본문
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: '학습' })).toHaveAttribute(
      'href',
      '/study',
    );
    expect(screen.getByRole('button', { name: '프로필' })).toBeInTheDocument();
  });
});
