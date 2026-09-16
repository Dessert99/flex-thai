import type { Meta, StoryObj } from '@storybook/react-vite';
import { useId } from 'react';
import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';
function Example({
  disabled = false,
  invalid = false,
}: {
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <RadioGroup
      defaultValue='10'
      disabled={disabled}
      aria-label='연습 문항 수'
      aria-invalid={invalid}
    >
      {['10', '20', '30'].map((value) => (
        <div
          key={value}
          className='flex items-center gap-cluster'
        >
          <RadioGroupItem
            id={`${id}-${value}`}
            value={value}
            aria-invalid={invalid}
          />
          <Label htmlFor={`${id}-${value}`}>{value}문항</Label>
        </div>
      ))}
    </RadioGroup>
  );
}
const meta = {
  title: 'Shared/UI/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof RadioGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { name: '기본', render: () => <Example /> };
export const Disabled: Story = {
  name: '비활성',
  render: () => <Example disabled />,
};
export const Invalid: Story = {
  name: '오류',
  render: () => <Example invalid />,
};
