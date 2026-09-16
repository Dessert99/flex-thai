import type { Meta, StoryObj } from '@storybook/react-vite';
import { InfoIcon, AlertCircleIcon } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from './alert';
const meta = {
  title: 'Shared/UI/Alert',
  component: Alert,
  args: { variant: 'default' },
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  name: '기본',
  render: (args) => (
    <Alert {...args}>
      <InfoIcon />
      <AlertTitle>학습 안내</AlertTitle>
      <AlertDescription>오늘의 학습 목표를 확인하세요.</AlertDescription>
    </Alert>
  ),
};
export const Destructive: Story = {
  name: '오류',
  args: { variant: 'destructive' },
  render: (args) => (
    <Alert {...args}>
      <AlertCircleIcon />
      <AlertTitle>저장하지 못했습니다.</AlertTitle>
      <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
    </Alert>
  ),
};
