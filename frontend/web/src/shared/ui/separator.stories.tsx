import type { Meta, StoryObj } from '@storybook/react-vite';
import { Separator } from './separator';
const meta = {
  title: 'Shared/UI/Separator',
  component: Separator,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Horizontal: Story = {
  name: '가로',
  render: () => (
    <div className='grid w-form gap-cluster'>
      <p>오늘의 학습</p>
      <Separator />
      <p>지난 학습 기록</p>
    </div>
  ),
};
export const Vertical: Story = {
  name: '세로',
  render: () => (
    <div className='flex h-control items-center gap-cluster'>
      <span>어휘</span>
      <Separator orientation='vertical' />
      <span>문제</span>
      <Separator orientation='vertical' />
      <span>기록</span>
    </div>
  ),
};
