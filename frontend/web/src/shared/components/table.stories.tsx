import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from './table';
const rows = [
  { label: '기초 어휘', count: 10, result: '완료' },
  { label: '문장 읽기', count: 5, result: '진행 중' },
];
const meta = { title: 'Shared/UI/Table', component: Table } satisfies Meta<
  typeof Table
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  name: '목록·합계·선택 행',
  render: (args) => (
    <Table {...args}>
      <TableCaption>오늘의 학습 기록</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope='col'>학습 항목</TableHead>
          <TableHead scope='col'>문항 수</TableHead>
          <TableHead scope='col'>상태</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={row.label}
            data-state={index === 0 ? 'selected' : undefined}
          >
            <TableCell>{row.label}</TableCell>
            <TableCell>{row.count}</TableCell>
            <TableCell>{row.result}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>합계</TableCell>
          <TableCell>15</TableCell>
          <TableCell>2개 항목</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
export const Empty: Story = {
  name: '빈 목록',
  render: (args) => (
    <Table {...args}>
      <TableCaption>학습 기록</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope='col'>학습 항목</TableHead>
          <TableHead scope='col'>상태</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={2}
            className='text-center'
          >
            아직 학습 기록이 없습니다.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
