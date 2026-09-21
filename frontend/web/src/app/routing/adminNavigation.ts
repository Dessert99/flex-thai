/** 관리자 shell이 공개하는 승인된 콘텐츠 관리 경로만 정의한다 */
import {
  BookType,
  House,
  MessageSquareWarning,
  ScrollText,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { SidebarLayoutNavigationItem } from '../layouts/SidebarLayout';

/** 학습자 경로와 분리된 관리자 주요 메뉴 */
export const adminNavigation = [
  { group: '개요', href: '/admin', icon: House, label: '관리 홈' },
  {
    group: '콘텐츠',
    href: '/admin/vocabulary-extraction',
    icon: WandSparkles,
    label: '단어 추출',
  },
  {
    group: '콘텐츠',
    href: '/admin/vocabularies',
    icon: BookType,
    label: '어휘 관리',
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
    href: '/admin/audit-logs',
    icon: ScrollText,
    label: '감사 기록',
  },
] as const satisfies readonly SidebarLayoutNavigationItem[];
