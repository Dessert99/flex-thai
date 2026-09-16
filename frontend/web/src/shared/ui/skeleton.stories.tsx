import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './skeleton';
const meta = {
  title: 'Shared/UI/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  name: '텍스트 로딩',
  render: () => (
    <div
      role='status'
      aria-label='불러오는 중'
      className='grid max-w-form gap-cluster'
    >
      <Skeleton className='h-control w-full' />
      <Skeleton className='h-control w-full' />
    </div>
  ),
};
export const Profile: Story = {
  name: '프로필 로딩',
  render: () => (
    <div
      role='status'
      aria-label='프로필 불러오는 중'
      className='flex max-w-form items-center gap-cluster'
    >
      <Skeleton className='size-control rounded-full' />
      <div className='grid flex-1 gap-cluster'>
        <Skeleton className='h-control w-full' />
        <Skeleton className='h-control w-full' />
      </div>
    </div>
  ),
};
