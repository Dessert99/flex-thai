/** 관리자 shell이 공개하는 승인된 콘텐츠 관리 경로만 정의한다 */
import type { AppShellNavigationItem } from '@/shared/ui/app-shell';

/** 학습자 경로와 분리된 관리자 주요 메뉴 */
export const adminNavigation = [
  { href: '/admin', label: '관리 홈' },
  { href: '/admin/content-imports', label: '콘텐츠 가져오기' },
  { href: '/admin/content-production', label: '콘텐츠 제작' },
  {
    href: '/admin/content-production/vocabulary-candidates',
    label: '어휘 후보 검수',
  },
  { href: '/admin/tts', label: 'TTS 운영' },
  { href: '/admin/usage-cost', label: '사용량·비용' },
  { href: '/admin/questions', label: '문제 관리' },
  { href: '/admin/vocabularies', label: '어휘 관리' },
  { href: '/admin/concepts', label: '개념 관리' },
  { href: '/admin/content-error-reports', label: '오류 신고' },
  { href: '/admin/users', label: '사용자 관리' },
  { href: '/admin/question-settings', label: '문제 유형 설정' },
  { href: '/admin/audit-logs', label: '감사 기록' },
] as const satisfies readonly AppShellNavigationItem[];
