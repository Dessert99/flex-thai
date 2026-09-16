import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './textarea';
const meta = {
  title: 'Shared/UI/Textarea',
  component: Textarea,
  args: {
    'aria-label': '학습 메모',
    placeholder: '학습하며 기억할 내용을 적으세요.',
    rows: 4,
  },
  decorators: [
    (Story) => (
      <div className='w-form'>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { name: '기본' };
export const Filled: Story = {
  name: '입력됨',
  args: { defaultValue: '오늘 배운 표현을 내일 다시 복습하기' },
};
export const Disabled: Story = { name: '비활성', args: { disabled: true } };
export const Invalid: Story = { name: '오류', args: { 'aria-invalid': true } };
export const ReadOnly: Story = {
  name: '읽기 전용',
  args: { readOnly: true, value: '저장된 학습 메모입니다.' },
};
