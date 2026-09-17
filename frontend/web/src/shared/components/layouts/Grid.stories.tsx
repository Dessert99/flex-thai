import type { Meta, StoryObj } from '@storybook/react-vite';
import { Grid } from './Grid';
import { Container } from './Container';
import { Stack } from './Stack';
import { Card, CardContent, CardHeader, CardTitle } from '../card';

const meta = {
  title: 'Shared/UI/Grid',
  component: Grid,
  args: {
    gap: 'cluster',
    children: ['항목 1', '항목 2', '항목 3', '항목 4'].map((label) => (
      <div
        key={label}
        className='min-w-none border border-border bg-card p-cluster text-card-foreground'
      >
        {label}
      </div>
    )),
  },
  argTypes: {
    gap: { control: 'select', options: ['none', 'cluster', 'section'] },
  },
} satisfies Meta<typeof Grid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NoGap: Story = { args: { gap: 'none', className: 'grid-cols-2' } };
export const Section: Story = {
  args: { gap: 'section', className: 'grid-cols-2' },
};
export const Responsive: Story = {
  args: { className: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' },
};
export const Override: Story = {
  name: '간격·열 개수 덮어쓰기',
  args: { gap: 'section', className: 'gap-cluster grid-cols-2' },
};
export const SemanticElement: Story = {
  args: {
    asChild: true,
    className: 'grid-cols-2',
    children: (
      <ul aria-label='학습 목록'>
        <li>어휘 학습</li>
        <li>문제 풀이</li>
      </ul>
    ),
  },
};
export const Composition: Story = {
  name: 'Container · Stack · Grid · Card 조합',
  render: (args) => (
    <Container className='max-w-content'>
      <Stack gap='section'>
        <h2 className='text-heading'>학습 선택</h2>
        <Grid
          {...args}
          className='md:grid-cols-2'
        >
          {['어휘 학습', '문제 풀이'].map((title) => (
            <Card
              key={title}
              className='min-w-none'
            >
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>부모 Grid가 카드 너비를 결정합니다.</CardContent>
            </Card>
          ))}
        </Grid>
      </Stack>
    </Container>
  ),
};
