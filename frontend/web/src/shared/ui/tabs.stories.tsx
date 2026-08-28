/** Tabs의 스타일·방향·비활성 상태를 학습 정보 전환 조합으로 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

interface TabsExampleProps {
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  variant?: 'default' | 'line';
}

function TabsExample({
  disabled = false,
  orientation = 'horizontal',
  variant = 'default',
}: TabsExampleProps) {
  return (
    <Tabs
      className='w-full max-w-form'
      defaultValue='meaning'
      orientation={orientation}
    >
      <TabsList variant={variant}>
        <TabsTrigger value='meaning'>뜻</TabsTrigger>
        <TabsTrigger value='pronunciation'>발음</TabsTrigger>
        <TabsTrigger
          disabled={disabled}
          value='examples'
        >
          예문
        </TabsTrigger>
      </TabsList>
      <TabsContent value='meaning'>
        <p className='rounded-panel border border-default p-page'>
          สวัสดี는 만날 때 사용하는 기본 인사말입니다.
        </p>
      </TabsContent>
      <TabsContent value='pronunciation'>
        <p className='rounded-panel border border-default p-page'>
          발음: 싸왓디
        </p>
      </TabsContent>
      <TabsContent value='examples'>
        <p className='rounded-panel border border-default p-page'>
          สวัสดีครับ · 안녕하세요.
        </p>
      </TabsContent>
    </Tabs>
  );
}

const meta = {
  parameters: {
    layout: 'centered',
  },
  title: 'Shared/UI/Tabs',
} satisfies Meta;

/** Tabs 하위 primitive를 실제 학습 정보 전환 조합으로 문서화한다 */
export default meta;

type Story = StoryObj;

/** 배경으로 선택 상태를 구분하는 기준 탭을 제공한다 */
export const Default: Story = {
  name: '기본',
  render: () => <TabsExample />,
};

/** 밑줄로 선택 상태를 구분하는 대체 스타일을 제공한다 */
export const Line: Story = {
  name: '선 스타일',
  render: () => <TabsExample variant='line' />,
};

/** 세로 정보 구조에서 탭과 본문의 정렬을 검수한다 */
export const Vertical: Story = {
  name: '세로',
  render: () => <TabsExample orientation='vertical' />,
};

/** 선택할 수 없는 탭이 나머지 탐색을 막지 않는 상태를 제공한다 */
export const Disabled: Story = {
  name: '일부 비활성',
  render: () => <TabsExample disabled />,
};
