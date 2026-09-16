import type { Meta, StoryObj } from '@storybook/react-vite';
import { useId } from 'react';
import { Input } from './input';
import { Label } from './label';
function Example({ disabled = false }: { disabled?: boolean }) {
  const id = useId();
  return (
    <div className='grid w-form gap-cluster'>
      <Label htmlFor={id}>학습 목표</Label>
      <Input
        id={id}
        disabled={disabled}
        placeholder='목표를 입력하세요'
      />
    </div>
  );
}
const meta = {
  title: 'Shared/UI/Label',
  component: Label,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Label>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { name: '입력 연결', render: () => <Example /> };
export const Disabled: Story = {
  name: '비활성 입력',
  render: () => <Example disabled />,
};
