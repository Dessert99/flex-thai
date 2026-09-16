/** Input의 입력 가능·비활성·오류 상태를 실제 label과 함께 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';
import { Label } from './label';

const meta = {
  args: {
    id: 'learning-goal',
    placeholder: '예: FLEX 읽기 300점',
    type: 'text',
  },
  component: Input,
  parameters: {
    layout: 'centered',
  },
  render: (args) => (
    <div className='grid w-form gap-cluster'>
      <Label htmlFor={args.id}>학습 목표</Label>
      <Input {...args} />
    </div>
  ),
  title: 'Shared/UI/Input',
} satisfies Meta<typeof Input>;

/** Input을 실제 label을 포함한 사용 조건으로 문서화한다 */
export default meta;

type Story = StoryObj<typeof meta>;

/** 사용자가 값을 입력하기 전의 기준 상태를 제공한다 */
export const Default: Story = {
  name: '기본',
};

/** 수정할 수 없는 입력의 상태를 제공한다 */
export const Disabled: Story = {
  args: {
    defaultValue: 'FLEX 읽기 300점',
    disabled: true,
  },
  name: '비활성',
};

/** 잘못된 입력을 제어 자체에서도 식별하는 상태를 제공한다 */
export const Invalid: Story = {
  args: {
    'aria-invalid': true,
    defaultValue: '목표',
  },
  name: '오류',
};

/** 긴 학습 목표가 입력 너비를 깨뜨리지 않는지 확인한다 */
export const LongContent: Story = {
  args: {
    defaultValue:
      '다음 FLEX 시험까지 읽기 영역의 취약 유형을 집중적으로 학습하기',
  },
  name: '긴 내용',
};
