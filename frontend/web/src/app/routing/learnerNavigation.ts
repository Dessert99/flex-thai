/** 학습자 shell이 공개하는 승인된 학습 경로만 정의한다 */
import {
  BookOpenText,
  Dumbbell,
  History,
  House,
  Languages,
  Library,
  Search,
} from 'lucide-react';
import type { SidebarLayoutNavigationItem } from '../layouts/SidebarLayout';

/** 관리자 경로와 분리된 학습자 주요 메뉴 */
export const learnerNavigation = [
  { group: '학습', href: '/learn', icon: House, label: '학습 홈' },
  { group: '학습', href: '/questions', icon: Search, label: '문제 찾기' },
  { group: '학습', href: '/history', icon: History, label: '오답 기록' },
  { group: '학습', href: '/practice', icon: Dumbbell, label: '단어 연습' },
  {
    group: '콘텐츠',
    href: '/concepts',
    search: { category: 'GRAMMAR' },
    icon: BookOpenText,
    label: '개념 학습',
  },
  {
    group: '콘텐츠',
    href: '/vocabularies',
    icon: Languages,
    label: '어휘 찾기',
  },
  {
    group: '콘텐츠',
    href: '/wordbooks',
    icon: Library,
    label: '내 단어장',
  },
] as const satisfies readonly SidebarLayoutNavigationItem[];
