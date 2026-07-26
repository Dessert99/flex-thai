/** 관리자 오류 신고 화면의 filter·상세·workflow 상호작용을 검증한다 */
import type {
  AdminContentErrorReportDetailResponse,
  AdminContentErrorReportListResponse,
} from '@flex-thia/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentErrorReportSearch } from '../model/contentErrorReportSearch';
import {
  ContentErrorReportManagementPageView,
  type ContentErrorReportManagementPageViewProps,
} from './ContentErrorReportManagementPageView';

const ids = {
  report: '00000000-0000-4000-8000-000000000001',
  reporter: '00000000-0000-4000-8000-000000000002',
  assignee: '00000000-0000-4000-8000-000000000003',
  content: '00000000-0000-4000-8000-000000000004',
  history: '00000000-0000-4000-8000-000000000005',
};
const timestamp = '2026-07-26T00:00:00.000Z';
const summary = {
  id: ids.report,
  reporter: { id: ids.reporter, email: 'learner@example.com' },
  targetKind: 'QUESTION' as const,
  category: 'OTHER' as const,
  status: 'OPEN' as const,
  assignee: { id: ids.assignee, email: 'admin@example.com' },
  description: '정답 설명이 다릅니다.',
  canonicalReference: {
    kind: 'QUESTION' as const,
    contentId: ids.content,
    contentVersionId: ids.content,
    questionVersionId: ids.content,
    sentenceVersionId: null,
    mediaAssetId: null,
    locationId: null,
  },
  snapshot: {
    title: '문제',
    primaryText: '문제 본문',
    secondaryText: null,
    versionLabel: '버전 1',
    locationLabel: '문제 전체',
    audioAssetId: null,
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const reports: AdminContentErrorReportListResponse = {
  items: [summary],
  page: {
    page: 2,
    pageSize: 20,
    totalItems: 45,
    totalPages: 3,
  },
};
const detail: AdminContentErrorReportDetailResponse = {
  ...summary,
  history: [
    {
      id: ids.history,
      action: 'STATUS_CHANGED',
      actor: { id: ids.assignee, email: 'admin@example.com' },
      fromStatus: 'OPEN',
      toStatus: 'IN_PROGRESS',
      fromAssigneeUserId: null,
      toAssigneeUserId: null,
      createdAt: timestamp,
    },
  ],
};

const renderView = (
  overrides: Partial<ContentErrorReportManagementPageViewProps> = {},
) => {
  const props: ContentErrorReportManagementPageViewProps = {
    reports,
    detail,
    search: { page: 2, pageSize: 20 },
    loading: false,
    detailLoading: false,
    error: false,
    detailError: false,
    mutationError: false,
    mutating: false,
    onSearchChange: vi.fn(),
    onSelect: vi.fn(),
    onStatusChange: vi.fn(),
    onAssign: vi.fn(),
    onUnassign: vi.fn(),
    ...overrides,
  };
  render(<ContentErrorReportManagementPageView {...props} />);
  return props;
};

describe('ContentErrorReportManagementPageView', () => {
  it('상태·대상·분류·담당자 filter를 적용하고 page를 1로 되돌린다', () => {
    const props = renderView({ detail: undefined });

    fireEvent.change(screen.getByLabelText('상태'), {
      target: { value: 'OPEN' },
    });
    fireEvent.change(screen.getByLabelText('대상'), {
      target: { value: 'QUESTION' },
    });
    fireEvent.change(screen.getByLabelText('분류'), {
      target: { value: 'OTHER' },
    });
    fireEvent.change(screen.getByLabelText('담당자 ID'), {
      target: { value: ids.assignee },
    });
    const filterForm = screen
      .getByRole('button', { name: '필터 적용' })
      .closest('form');
    expect(filterForm).not.toBeNull();
    if (!filterForm) return;
    fireEvent.submit(filterForm);

    expect(props.onSearchChange).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 20,
      status: 'OPEN',
    });
    expect(props.onSearchChange).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 20,
      targetKind: 'QUESTION',
    });
    expect(props.onSearchChange).toHaveBeenNthCalledWith(3, {
      page: 1,
      pageSize: 20,
      category: 'OTHER',
    });
    expect(props.onSearchChange).toHaveBeenNthCalledWith(4, {
      page: 1,
      pageSize: 20,
      assigneeUserId: ids.assignee,
    });
  });

  it('네 filter의 전체·빈 값을 선택하면 기존 조건을 제거한다', () => {
    const search: ContentErrorReportSearch = {
      page: 3,
      pageSize: 20,
      status: 'OPEN',
      targetKind: 'QUESTION',
      category: 'OTHER',
      assigneeUserId: ids.assignee,
    };
    const props = renderView({ detail: undefined, search });

    fireEvent.change(screen.getByLabelText('상태'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('대상'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('분류'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('담당자 ID'), {
      target: { value: '' },
    });
    const filterForm = screen
      .getByRole('button', { name: '필터 적용' })
      .closest('form');
    expect(filterForm).not.toBeNull();
    if (!filterForm) return;
    fireEvent.submit(filterForm);

    expect(props.onSearchChange).toHaveBeenCalledTimes(4);
    for (const [next] of vi.mocked(props.onSearchChange).mock.calls) {
      expect(next.page).toBe(1);
    }
    expect(
      vi.mocked(props.onSearchChange).mock.calls[0]?.[0],
    ).not.toHaveProperty('status');
    expect(
      vi.mocked(props.onSearchChange).mock.calls[1]?.[0],
    ).not.toHaveProperty('targetKind');
    expect(
      vi.mocked(props.onSearchChange).mock.calls[2]?.[0],
    ).not.toHaveProperty('category');
    expect(
      vi.mocked(props.onSearchChange).mock.calls[3]?.[0],
    ).not.toHaveProperty('assigneeUserId');
  });
});

describe('ContentErrorReportManagementPageView 탐색', () => {
  it('목록 선택과 이전·다음 page 이동을 전달한다', () => {
    const props = renderView({ detail: undefined });

    fireEvent.click(screen.getByRole('button', { name: /문제 · OPEN/u }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(props.onSelect).toHaveBeenCalledWith(ids.report);
    expect(props.onSearchChange).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 20,
    });
    expect(props.onSearchChange).toHaveBeenNthCalledWith(2, {
      page: 3,
      pageSize: 20,
    });
  });

  it('snapshot·history와 현재 상태에서 허용된 전이만 제공한다', () => {
    const props = renderView();

    expect(screen.getByText('문제 본문')).toBeInTheDocument();
    expect(screen.getByText(/STATUS_CHANGED/u)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '대상 콘텐츠 열기' }),
    ).toHaveAttribute('href', `/admin/questions/${ids.content}`);
    for (const status of ['IN_PROGRESS', 'RESOLVED', 'REJECTED']) {
      fireEvent.click(screen.getByRole('button', { name: status }));
    }
    expect(props.onStatusChange).toHaveBeenNthCalledWith(1, 'IN_PROGRESS');
    expect(props.onStatusChange).toHaveBeenNthCalledWith(2, 'RESOLVED');
    expect(props.onStatusChange).toHaveBeenNthCalledWith(3, 'REJECTED');
    expect(
      screen.queryByRole('button', { name: 'OPEN' }),
    ).not.toBeInTheDocument();
  });
});

describe('ContentErrorReportManagementPageView workflow', () => {
  it('상세가 없어도 상세 조회 오류를 mutation 오류와 구분해 표시한다', () => {
    renderView({
      detail: undefined,
      detailError: true,
      mutationError: false,
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '신고 상세를 불러오지 못했습니다.',
    );
    expect(screen.queryByText('변경을 저장하지 못했습니다.')).toBeNull();
  });

  it('담당자 교체·해제와 mutation 오류를 표시한다', () => {
    const props = renderView({ mutationError: true });
    const assigneeInputs = screen.getAllByLabelText('담당자 ID');
    const assignmentInput = assigneeInputs[1];
    expect(assignmentInput).toBeDefined();
    if (!assignmentInput) return;
    fireEvent.change(assignmentInput, {
      target: { value: ids.reporter },
    });
    const assignmentForm = screen
      .getByRole('button', { name: '담당자 교체' })
      .closest('form');
    expect(assignmentForm).not.toBeNull();
    if (!assignmentForm) return;
    fireEvent.submit(assignmentForm);
    fireEvent.click(screen.getByRole('button', { name: '담당자 해제' }));

    expect(props.onAssign).toHaveBeenCalledWith(ids.reporter);
    expect(props.onUnassign).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '변경을 저장하지 못했습니다.',
    );
  });

  it('mutation 중에는 form과 handler가 workflow를 중복 호출하지 않는다', () => {
    const props = renderView({ mutating: true });
    const assignmentForm = screen
      .getByRole('button', { name: '담당자 교체' })
      .closest('form');
    expect(assignmentForm).not.toBeNull();
    if (!assignmentForm) return;

    fireEvent.submit(assignmentForm);
    fireEvent.click(screen.getByRole('button', { name: '담당자 해제' }));
    fireEvent.click(screen.getByRole('button', { name: 'IN_PROGRESS' }));

    expect(props.onAssign).not.toHaveBeenCalled();
    expect(props.onUnassign).not.toHaveBeenCalled();
    expect(props.onStatusChange).not.toHaveBeenCalled();
  });
});
