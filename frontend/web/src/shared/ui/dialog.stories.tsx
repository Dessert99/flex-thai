/** Dialog의 trigger·portal·제목·행동 조합을 실제 확인 흐름으로 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

function DialogExample({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>학습 기록 초기화</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>학습 기록을 초기화할까요?</DialogTitle>
          <DialogDescription>
            저장된 풀이 기록과 진도는 복구할 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>취소</Button>
          </DialogClose>
          <Button variant='destructive'>초기화</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  parameters: {
    layout: 'centered',
  },
  title: 'Shared/UI/Dialog',
} satisfies Meta;

/** Dialog 하위 primitive를 복구 불가능한 행동 확인 패턴으로 문서화한다 */
export default meta;

type Story = StoryObj;

/** 사용자가 필요할 때 확인 창을 여는 기준 상태를 제공한다 */
export const Default: Story = {
  name: '기본',
  render: () => <DialogExample />,
};

/** overlay·focus·확인 행동을 바로 검수할 수 있는 열린 상태를 제공한다 */
export const Open: Story = {
  name: '열림',
  render: () => <DialogExample defaultOpen />,
  tags: ['!autodocs'],
};
