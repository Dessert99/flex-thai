import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useId } from 'react';
import { toast } from 'sonner';
import { Button } from './button';
import { Toaster } from './sonner';
function Example() {
  const id = useId();
  useEffect(
    () => () => {
      toast.dismiss(id);
    },
    [id],
  );
  const options = { id, toasterId: id, duration: Infinity };
  return (
    <div className='flex flex-wrap gap-cluster'>
      <Toaster
        id={id}
        closeButton
      />
      <Button onClick={() => toast('변경 사항을 저장했습니다.', options)}>
        기본
      </Button>
      <Button onClick={() => toast.success('학습을 완료했습니다.', options)}>
        성공
      </Button>
      <Button onClick={() => toast.info('새 학습 자료가 있습니다.', options)}>
        안내
      </Button>
      <Button onClick={() => toast.warning('입력 내용을 확인하세요.', options)}>
        경고
      </Button>
      <Button onClick={() => toast.error('저장하지 못했습니다.', options)}>
        오류
      </Button>
      <Button onClick={() => toast.loading('저장 중입니다.', options)}>
        진행 중
      </Button>
      <Button
        variant='outline'
        onClick={() => toast.dismiss(id)}
      >
        알림 닫기
      </Button>
    </div>
  );
}
const meta = {
  title: 'Shared/UI/Sonner',
  parameters: { layout: 'centered' },
  tags: ['!autodocs'],
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const Default: Story = {
  name: '알림 종류와 닫기',
  render: () => <Example />,
};
