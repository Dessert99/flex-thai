/** 관리자 shell이 공개하는 승인된 콘텐츠 관리 경로만 정의한다 */
import type { AppShellNavigationItem } from '@/shared/ui/app-shell';

/** 학습자 경로와 분리된 관리자 주요 메뉴 */
export const adminNavigation = [
  { href: '/admin', label: '관리 홈' },
  { href: '/admin/content-imports', label: '콘텐츠 가져오기' },
  { href: '/admin/questions', label: '문제 관리' },
  { href: '/admin/vocabularies', label: '어휘 관리' },
] as const satisfies readonly AppShellNavigationItem[];
