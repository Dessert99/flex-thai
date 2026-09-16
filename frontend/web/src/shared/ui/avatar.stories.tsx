import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';
const portrait = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#dbeafe"/><circle cx="20" cy="15" r="7" fill="#2563eb"/><path d="M6 40v-6a14 14 0 0 1 28 0v6" fill="#2563eb"/></svg>')}`;
const meta = {
  title: 'Shared/UI/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  name: '이미지',
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage
        src={portrait}
        alt='학습자 프로필'
      />
      <AvatarFallback>학습</AvatarFallback>
    </Avatar>
  ),
};
export const Fallback: Story = {
  name: '이미지 없음',
  render: (args) => (
    <Avatar
      {...args}
      aria-label='학습자 프로필'
    >
      <AvatarFallback>학습</AvatarFallback>
    </Avatar>
  ),
};
