/** Button의 프로젝트 variant와 제어 상태를 시각적으로 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpenIcon } from 'lucide-react';
import { fn } from 'storybook/test';
import { Button } from './button';

const variants = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
] as const;

const sizes = ['xs', 'sm', 'default', 'lg'] as const;

const meta = {
  args: {
    children: '계속하기',
    onClick: fn(),
    type: 'button',
  },
  argTypes: {
    size: {
      control: 'select',
      options: [...sizes, 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
    },
    variant: {
      control: 'select',
      options: variants,
    },
  },
  component: Button,
  parameters: {
    layout: 'centered',
  },
  title: 'Shared/UI/Button',
} satisfies Meta<typeof Button>;

/** Button을 shared/ui 탐색 경로에 고정한다 */
export default meta;

type Story = StoryObj<typeof meta>;

/** 가장 일반적인 주요 행동의 기준 상태를 제공한다 */
export const Default: Story = {
  name: '기본',
};

/** 의미에 따른 강조 수준을 한 화면에서 비교한다 */
export const Variants: Story = {
  name: '종류',
  render: (args) => (
    <div className='flex flex-wrap items-center gap-cluster'>
      {variants.map((variant) => (
        <Button
          {...args}
          key={variant}
          variant={variant}
        >
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/** 밀도에 따른 제어 크기를 한 화면에서 비교한다 */
export const Sizes: Story = {
  name: '크기',
  render: (args) => (
    <div className='flex flex-wrap items-center gap-cluster'>
      {sizes.map((size) => (
        <Button
          {...args}
          key={size}
          size={size}
        >
          {size}
        </Button>
      ))}
    </div>
  ),
};

/** 실행할 수 없는 행동의 시각적 상태를 제공한다 */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
  name: '비활성',
};

/** 아이콘 전용 제어가 접근 가능한 이름을 갖는 기준을 제공한다 */
export const IconOnly: Story = {
  args: {
    'aria-label': '학습 자료 열기',
    children: <BookOpenIcon />,
    size: 'icon',
    variant: 'outline',
  },
  name: '아이콘 전용',
};
