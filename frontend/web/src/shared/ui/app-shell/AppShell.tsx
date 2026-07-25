/** 역할과 라우터에 의존하지 않는 반응형 애플리케이션 골격을 제공한다 */
import type { ReactNode } from 'react';

/** AppShell이 렌더링할 도메인 중립 내비게이션 항목 */
export interface AppShellNavigationItem {
  href: string;
  label: string;
}

/** AppShell의 내비게이션·본문·선택 프로필 슬롯 */
export interface AppShellProps {
  children: ReactNode;
  navigation: readonly AppShellNavigationItem[];
  profileMenu?: ReactNode;
}

/** 모바일 단일 흐름과 데스크톱 사이드 내비게이션을 공유하는 shell */
export function AppShell({ children, navigation, profileMenu }: AppShellProps) {
  return (
    <div className='min-h-screen bg-surface text-primary'>
      <header className='border-b border-default bg-surface'>
        <div className='mx-auto flex w-full max-w-content items-center justify-between gap-cluster p-page'>
          <span className='text-title'>FLEX THIA</span>
          {profileMenu}
        </div>
      </header>
      <div className='mx-auto grid w-full max-w-content gap-section p-page md:grid-cols-4'>
        <nav
          aria-label='주요 메뉴'
          className='md:col-span-1'
        >
          <ul className='flex gap-cluster overflow-auto md:flex-col'>
            {navigation.map((item) => (
              <li key={item.href}>
                <a
                  className='block rounded-control px-cluster py-cluster text-body transition-colors duration-feedback hover:bg-surface-muted focus-visible:ring-focus'
                  href={item.href}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className='min-w-collapsible md:col-span-3'>{children}</main>
      </div>
    </div>
  );
}
