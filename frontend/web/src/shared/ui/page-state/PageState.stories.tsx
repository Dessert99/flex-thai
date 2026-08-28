/** 페이지 복구 상태의 로딩·빈 결과·오류 안내를 전체 폭에서 비교한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '@/shared/ui/button';
import { PageEmpty, PageError, PageLoading } from './PageState';

const meta = {
  parameters: {
    layout: 'fullscreen',
  },
  title: 'Shared/UI/PageState',
} satisfies Meta;

/** 서로 다른 페이지 복구 상태를 하나의 탐색 단위로 문서화한다 */
export default meta;

type Story = StoryObj;

/** 보조 기술에도 진행 중임을 알리는 로딩 상태를 제공한다 */
export const Loading: Story = {
  name: '로딩',
  render: () => <PageLoading message='학습 기록을 불러오고 있습니다.' />,
};

/** 결과가 없는 이유와 다음 행동을 함께 안내하는 상태를 제공한다 */
export const Empty: Story = {
  name: '빈 결과',
  render: () => (
    <PageEmpty
      action={<Button>첫 단어장 만들기</Button>}
      description='저장한 어휘를 모아 반복해서 학습할 수 있습니다.'
      title='아직 만든 단어장이 없습니다.'
    />
  ),
};

/** 사용자가 재시도할 수 있는 요청 실패 상태를 제공한다 */
export const Error: Story = {
  name: '오류',
  render: () => (
    <div className='p-page'>
      <PageError
        message='학습 기록을 불러오지 못했습니다.'
        onRetry={fn()}
        requestId='req-storybook-001'
      />
    </div>
  ),
};
