import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuShortcut,
} from './dropdown-menu';
function Example({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [showCompleted, setShowCompleted] = useState(true);
  const [order, setOrder] = useState('latest');
  const [action, setAction] = useState('선택한 작업이 없습니다.');
  return (
    <div className='grid gap-cluster'>
      <DropdownMenu defaultOpen={defaultOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant='outline'>학습 설정</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>목록 설정</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={showCompleted}
            onCheckedChange={setShowCompleted}
          >
            완료한 항목 표시
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={order}
            onValueChange={setOrder}
          >
            <DropdownMenuRadioItem value='latest'>최신순</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='name'>이름순</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>내보내기</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onSelect={() => setAction('텍스트 내보내기 선택')}
                >
                  텍스트
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setAction('표 내보내기 선택')}
                >
                  표
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem disabled>
            삭제<DropdownMenuShortcut>⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <p role='status'>{action}</p>
    </div>
  );
}
const meta = {
  title: 'Shared/UI/DropdownMenu',
  parameters: { layout: 'centered' },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const Default: Story = {
  name: '선택·체크·하위 메뉴',
  render: () => <Example />,
};
export const Open: Story = {
  name: '열림',
  render: () => <Example defaultOpen />,
  tags: ['!autodocs'],
};
