import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from './Container';

const meta = {
  title: 'Shared/UI/Container',
  component: Container,
  parameters: { layout: 'fullscreen' },
  args: {
    padding: 'page',
    children: (
      <div className='border border-border bg-card p-cluster text-card-foreground'>
        부모 너비를 따르는 콘텐츠
      </div>
    ),
  },
  argTypes: {
    padding: {
      control: 'select',
      options: ['none', 'cluster', 'section', 'page'],
    },
  },
} satisfies Meta<typeof Container>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NoPadding: Story = { args: { padding: 'none' } };
export const Cluster: Story = { args: { padding: 'cluster' } };
export const Section: Story = { args: { padding: 'section' } };
export const Constrained: Story = {
  name: '사용처에서 최대 너비 지정',
  args: { className: 'max-w-form' },
};
export const Override: Story = {
  name: 'className으로 패딩 덮어쓰기',
  args: { padding: 'section', className: 'max-w-form p-cluster' },
};
export const SemanticElement: Story = {
  name: 'section으로 렌더링',
  args: {
    asChild: true,
    children: (
      <section aria-label='학습 영역'>
        추가 wrapper 없이 section으로 렌더링합니다.
      </section>
    ),
  },
};
