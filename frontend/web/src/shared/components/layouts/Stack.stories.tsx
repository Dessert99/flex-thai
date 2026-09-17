import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from './Stack';

const meta = {
  title: 'Shared/UI/Stack',
  component: Stack,
  args: {
    gap: 'cluster',
    children: ['제목', '설명', '액션'].map((label) => (
      <div
        key={label}
        className='border border-border bg-card p-cluster text-card-foreground'
      >
        {label}
      </div>
    )),
  },
  argTypes: {
    gap: { control: 'select', options: ['none', 'cluster', 'section'] },
  },
} satisfies Meta<typeof Stack>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NoGap: Story = { args: { gap: 'none' } };
export const Section: Story = { args: { gap: 'section' } };
export const Override: Story = {
  name: '간격·정렬 덮어쓰기',
  args: { gap: 'section', className: 'gap-cluster items-start' },
};
export const SemanticElement: Story = {
  args: {
    asChild: true,
    children: (
      <section aria-label='학습 안내'>
        <h2>학습 안내</h2>
        <p>제목과 설명 사이에 간격을 적용합니다.</p>
      </section>
    ),
  },
};
