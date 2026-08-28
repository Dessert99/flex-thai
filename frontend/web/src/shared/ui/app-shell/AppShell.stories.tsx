/** AppShell의 학습자·관리자 내비게이션과 선택 슬롯을 전체 화면에서 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/shared/ui/button';
import { AppShell } from './AppShell';

const learnerNavigation = [
  { href: '#learn', label: '오늘의 학습' },
  { href: '#practice', label: '문제 풀이' },
  { href: '#vocabularies', label: '어휘' },
  { href: '#wordbooks', label: '단어장' },
  { href: '#history', label: '학습 기록' },
] as const;

const adminNavigation = [
  { href: '#dashboard', label: '운영 현황' },
  { href: '#questions', label: '문제 관리' },
  { href: '#vocabularies', label: '어휘 관리' },
  { href: '#contents', label: '콘텐츠 제작' },
  { href: '#users', label: '사용자 관리' },
] as const;

const meta = {
  args: {
    children: (
      <section className='grid gap-cluster'>
        <h1 className='text-title'>오늘의 학습</h1>
        <p className='text-body text-subtle'>
          취약한 듣기 문제부터 차례로 학습해 보세요.
        </p>
      </section>
    ),
    identity: {
      email: 'learner@example.com',
      role: 'LEARNER',
    },
    navigation: learnerNavigation,
    profileMenu: <Button variant='outline'>로그아웃</Button>,
  },
  argTypes: {
    children: { control: false },
    profileMenu: { control: false },
  },
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
  title: 'Shared/UI/AppShell',
} satisfies Meta<typeof AppShell>;

/** AppShell을 제품 전체 골격의 shared/ui 경로에 고정한다 */
export default meta;

type Story = StoryObj<typeof meta>;

/** 학습자가 핵심 학습 영역을 이동하는 기준 shell을 제공한다 */
export const Learner: Story = {
  name: '학습자',
};

/** 관리자가 운영 영역과 학습 포털을 함께 탐색하는 shell을 제공한다 */
export const Admin: Story = {
  args: {
    children: (
      <section className='grid gap-cluster'>
        <h1 className='text-title'>운영 현황</h1>
        <p className='text-body text-subtle'>
          콘텐츠 제작과 사용자 운영 상태를 확인하세요.
        </p>
      </section>
    ),
    identity: {
      email: 'admin@example.com',
      role: 'ADMIN',
    },
    navigation: adminNavigation,
    portalLink: {
      href: '#learner-portal',
      label: '학습 포털',
    },
  },
  name: '관리자',
};
