/** 관리자 shell이 공개하는 승인된 콘텐츠 관리 경로만 정의한다 */
import {
  AudioLines,
  BookOpenText,
  BookType,
  CircleDollarSign,
  Database,
  FileQuestion,
  House,
  MessageSquareWarning,
  ScrollText,
  SlidersHorizontal,
  Upload,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { AppShellNavigationItem } from '@/shared/ui/app-shell';

/** 학습자 경로와 분리된 관리자 주요 메뉴 */
export const adminNavigation = [
  { group: '개요', href: '/admin', icon: House, label: '관리 홈' },
  {
    group: '콘텐츠',
    href: '/admin/content-imports',
    icon: Upload,
    label: '콘텐츠 가져오기',
  },
  {
    group: '콘텐츠',
    href: '/admin/content-production',
    icon: WandSparkles,
    label: '콘텐츠 제작',
  },
  {
    group: '콘텐츠',
    href: '/admin/content-production/vocabulary-candidates',
    icon: Database,
    label: '어휘 후보 검수',
  },
  {
    group: '콘텐츠',
    href: '/admin/questions',
    icon: FileQuestion,
    label: '문제 관리',
  },
  {
    group: '콘텐츠',
    href: '/admin/vocabularies',
    icon: BookType,
    label: '어휘 관리',
  },
  {
    group: '콘텐츠',
    href: '/admin/concepts',
    icon: BookOpenText,
    label: '개념 관리',
  },
  {
    group: '운영',
    href: '/admin/tts',
    icon: AudioLines,
    label: 'TTS 운영',
  },
  {
    group: '운영',
    href: '/admin/usage-cost',
    icon: CircleDollarSign,
    label: '사용량·비용',
  },
  {
    group: '운영',
    href: '/admin/content-error-reports',
    icon: MessageSquareWarning,
    label: '오류 신고',
  },
  {
    group: '시스템',
    href: '/admin/users',
    icon: Users,
    label: '사용자 관리',
  },
  {
    group: '시스템',
    href: '/admin/question-settings',
    icon: SlidersHorizontal,
    label: '문제 유형 설정',
  },
  {
    group: '시스템',
    href: '/admin/audit-logs',
    icon: ScrollText,
    label: '감사 기록',
  },
] as const satisfies readonly AppShellNavigationItem[];
