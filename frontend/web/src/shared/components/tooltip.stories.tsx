import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
function Example({
  side = 'top',
  open,
}: {
  side?: 'top' | 'right' | 'bottom' | 'left';
  open?: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip {...(open === undefined ? {} : { open })}>
        <TooltipTrigger asChild>
          <Button variant='outline'>학습 기록</Button>
        </TooltipTrigger>
        <TooltipContent side={side}>
          최근 학습한 문제와 정답률을 확인합니다.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
const meta = {
  title: 'Shared/UI/Tooltip',
  parameters: { layout: 'centered' },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const Default: Story = {
  name: '마우스·키보드 포커스',
  render: () => <Example />,
};
export const Open: Story = {
  name: '열림',
  render: () => <Example open />,
  tags: ['!autodocs'],
};
export const Right: Story = {
  name: '오른쪽',
  render: () => (
    <Example
      side='right'
      open
    />
  ),
  tags: ['!autodocs'],
};
