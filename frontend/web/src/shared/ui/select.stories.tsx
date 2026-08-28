/** Select의 실제 조합과 비활성·오류·열림 상태를 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './select';

interface SelectExampleProps {
  defaultOpen?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}

function SelectExample({
  defaultOpen = false,
  disabled = false,
  invalid = false,
}: SelectExampleProps) {
  return (
    <div className='grid w-form gap-cluster'>
      <Label htmlFor='difficulty'>학습 난이도</Label>
      <Select
        defaultOpen={defaultOpen}
        defaultValue='BASIC'
        disabled={disabled}
      >
        <SelectTrigger
          aria-invalid={invalid}
          className='w-full'
          id='difficulty'
        >
          <SelectValue placeholder='난이도를 선택하세요' />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>난이도</SelectLabel>
            <SelectItem value='BASIC'>기초</SelectItem>
            <SelectItem value='INTERMEDIATE'>중급</SelectItem>
            <SelectItem value='ADVANCED'>고급</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

const meta = {
  parameters: {
    layout: 'centered',
  },
  title: 'Shared/UI/Select',
} satisfies Meta;

/** Select 하위 primitive를 실제 소비 형태로 묶어 문서화한다 */
export default meta;

type Story = StoryObj;

/** 선택된 학습 난이도를 보여주는 기준 상태를 제공한다 */
export const Default: Story = {
  name: '기본',
  render: () => <SelectExample />,
};

/** 선택을 변경할 수 없는 상태를 제공한다 */
export const Disabled: Story = {
  name: '비활성',
  render: () => <SelectExample disabled />,
};

/** 유효하지 않은 선택 상태를 제어 자체에서도 식별한다 */
export const Invalid: Story = {
  name: '오류',
  render: () => <SelectExample invalid />,
};

/** portal 목록의 위치와 선택 항목 스타일을 직접 검수한다 */
export const Open: Story = {
  name: '열림',
  render: () => <SelectExample defaultOpen />,
  tags: ['!autodocs'],
};
