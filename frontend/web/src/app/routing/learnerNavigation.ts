/** 학습자 shell이 공개하는 승인된 학습 경로만 정의한다 */
import type { AppShellNavigationItem } from '@/shared/ui/app-shell';

/** 관리자 경로와 분리된 학습자 주요 메뉴 */
export const learnerNavigation = [
  { href: '/learn', label: '학습 홈' },
  { href: '/questions', label: '문제 찾기' },
  { href: '/history', label: '오답 기록' },
  { href: '/vocabularies', label: '어휘 찾기' },
  { href: '/wordbooks', label: '내 단어장' },
] as const satisfies readonly AppShellNavigationItem[];
