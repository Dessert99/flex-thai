/** Sheet의 trigger·방향·portal 조합을 보조 작업 패널로 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

interface SheetExampleProps {
  defaultOpen?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

function SheetExample({
  defaultOpen = false,
  side = 'right',
}: SheetExampleProps) {
  return (
    <Sheet defaultOpen={defaultOpen}>
      <SheetTrigger asChild>
        <Button variant='outline'>필터 열기</Button>
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>문제 필터</SheetTitle>
          <SheetDescription>
            학습할 문제의 유형과 난이도를 좁혀 보세요.
          </SheetDescription>
        </SheetHeader>
        <div className='grid gap-cluster px-cluster'>
          <Label htmlFor={`sheet-keyword-${side}`}>검색어</Label>
          <Input
            id={`sheet-keyword-${side}`}
            placeholder='태국어 또는 한국어'
          />
        </div>
        <SheetFooter>
          <Button>적용하기</Button>
          <SheetClose asChild>
            <Button variant='outline'>취소</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const meta = {
  parameters: {
    layout: 'centered',
  },
  title: 'Shared/UI/Sheet',
} satisfies Meta;

/** Sheet 하위 primitive를 실제 필터 패널 조합으로 문서화한다 */
export default meta;

type Story = StoryObj;

/** 보조 패널을 사용자가 직접 여는 기준 상태를 제공한다 */
export const Default: Story = {
  name: '기본',
  render: () => <SheetExample />,
};

/** 오른쪽 패널의 overlay와 전체 높이 레이아웃을 검수한다 */
export const Open: Story = {
  name: '오른쪽 열림',
  render: () => <SheetExample defaultOpen />,
  tags: ['!autodocs'],
};

/** 반대 방향에서도 동일한 정보 구조와 동작을 유지하는지 검수한다 */
export const Left: Story = {
  name: '왼쪽 열림',
  render: () => (
    <SheetExample
      defaultOpen
      side='left'
    />
  ),
  tags: ['!autodocs'],
};
