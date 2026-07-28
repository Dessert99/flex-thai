/** 문제 후보 목록의 그룹 표시·선택·pagination을 검증한다 */
import type { QuestionCandidateListResponse } from '@flex-thia/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionCandidateManagementPageView } from './QuestionCandidateManagementPageView';

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const base = {
  jobId: id(10),
  jobItemId: id(11),
  jobAttempt: 0,
  ordinal: 0,
  questionTypeVersionId: id(12),
  payloadState: 'CANONICAL' as const,
  topicId: id(13),
  difficulty: 3,
  review: {
    status: 'PENDING' as const,
    code: null,
    revision: 0,
    regeneratedFromCandidateId: null,
    approvedQuestionId: null,
    approvedQuestionVersionId: null,
  },
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};
const data = {
  items: [
    { ...base, id: id(1), resultGroup: 'NORMAL' },
    { ...base, id: id(2), resultGroup: 'NEEDS_ATTENTION' },
    { ...base, id: id(3), resultGroup: 'FAILED' },
  ],
  page: { page: 2, pageSize: 20, totalItems: 41, totalPages: 3 },
} satisfies QuestionCandidateListResponse;

describe('QuestionCandidateManagementPageView', () => {
  it('세 결과 그룹 badge와 현재 page를 표시한다', () => {
    render(
      <QuestionCandidateManagementPageView
        data={data}
        error={false}
        loading={false}
        onAction={vi.fn()}
        onPageChange={vi.fn()}
        onRetry={vi.fn()}
        onSelectionChange={vi.fn()}
        pending={false}
        search={{ page: 2, pageSize: 20 }}
        selectedIds={[]}
      />,
    );
    expect(screen.getByText('정상')).toBeVisible();
    expect(screen.getByText('검토 필요')).toBeVisible();
    expect(screen.getByText('실패')).toBeVisible();
    expect(screen.getByText('2 / 3')).toBeVisible();
  });

  it('선택 후보와 page 이동을 상위에 전달한다', () => {
    const onPageChange = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <QuestionCandidateManagementPageView
        data={data}
        error={false}
        loading={false}
        onAction={vi.fn()}
        onPageChange={onPageChange}
        onRetry={vi.fn()}
        onSelectionChange={onSelectionChange}
        pending={false}
        search={{ page: 2, pageSize: 20 }}
        selectedIds={[]}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '선택' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(onSelectionChange).toHaveBeenCalledWith(data.items[0]);
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });
});
