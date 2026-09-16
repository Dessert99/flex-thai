import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge';
const variants = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'ghost',
  'link',
] as const;
const meta = {
  title: 'Shared/UI/Badge',
  component: Badge,
  args: { children: '학습 중' },
  argTypes: { variant: { control: 'select', options: variants } },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { name: '기본' };
export const Variants: Story = {
  name: '종류',
  render: (args) => (
    <div className='flex flex-wrap gap-cluster'>
      {variants.map((variant) => (
        <Badge
          {...args}
          key={variant}
          variant={variant}
        >
          {variant}
        </Badge>
      ))}
    </div>
  ),
};
