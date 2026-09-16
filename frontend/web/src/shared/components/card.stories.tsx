import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge';
import { Button } from './button';
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';
const meta = {
  title: 'Shared/UI/Card',
  component: Card,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  name: '기본',
  render: (args) => (
    <Card
      {...args}
      className='w-form'
    >
      <CardHeader>
        <CardTitle>오늘의 학습</CardTitle>
        <CardDescription>목표에 맞춰 꾸준히 학습하세요.</CardDescription>
        <CardAction>
          <Badge variant='secondary'>진행 중</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>목표 10문항 중 6문항을 완료했습니다.</CardContent>
      <CardFooter>
        <Button>학습 계속하기</Button>
      </CardFooter>
    </Card>
  ),
};
export const Simple: Story = {
  name: '본문만',
  render: (args) => (
    <Card
      {...args}
      className='w-form'
    >
      <CardContent>간단한 정보를 담는 카드입니다.</CardContent>
    </Card>
  ),
};
