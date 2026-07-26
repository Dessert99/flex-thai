/** 관리자 오류 신고 View의 loading·empty·미배정 상태를 검증한다 */
import type {
  AdminContentErrorReportDetailResponse,
  AdminContentErrorReportListResponse,
} from '@flex-thia/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ContentErrorReportManagementPageView,
  type ContentErrorReportManagementPageViewProps,
} from './ContentErrorReportManagementPageView';

describe('관리자 오류 신고 View 비동기 상태', () => {
  it('목록 loading·오류·빈 결과를 각각 구분한다', () => {
    const { rerender } = render(
      <ContentErrorReportManagementPageView
        {...createProps({ loading: true })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '오류 신고를 불러오는 중입니다.',
    );

    rerender(
      <ContentErrorReportManagementPageView
        {...createProps({ loading: false, error: true })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      '오류 신고를 불러오지 못했습니다.',
    );

    rerender(
      <ContentErrorReportManagementPageView
        {...createProps({
          loading: false,
          error: false,
          detail: undefined,
          reports: emptyReports,
        })}
      />,
    );
    expect(screen.getByText('접수된 오류 신고가 없습니다.')).toBeVisible();
  });

  it('상세 loading과 미배정 담당자의 배정 행동을 제공한다', () => {
    const props = createProps({
      detail: { ...detail, assignee: null },
      detailLoading: true,
    });
    render(<ContentErrorReportManagementPageView {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      '상세를 불러오는 중입니다.',
    );
    expect(screen.getByText('담당자 미배정')).toBeVisible();
    expect(screen.getByRole('button', { name: '담당자 배정' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '담당자 해제' }),
    ).not.toBeInTheDocument();
    expect(props.onAssign).not.toHaveBeenCalled();
  });
});

const emptyReports: AdminContentErrorReportListResponse = {
  items: [],
  page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
};

const detail: AdminContentErrorReportDetailResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  reporter: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'learner@example.com',
  },
  targetKind: 'QUESTION',
  category: 'OTHER',
  status: 'OPEN',
  assignee: null,
  description: null,
  canonicalReference: {
    kind: 'QUESTION',
    contentId: '00000000-0000-4000-8000-000000000003',
    contentVersionId: null,
    questionVersionId: null,
    sentenceVersionId: null,
    mediaAssetId: null,
    locationId: null,
  },
  snapshot: {
    title: '문제',
    primaryText: '문제 본문',
    secondaryText: null,
    versionLabel: null,
    locationLabel: '문제 전체',
    audioAssetId: null,
  },
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  history: [],
};

function createProps(
  overrides: Partial<ContentErrorReportManagementPageViewProps> = {},
): ContentErrorReportManagementPageViewProps {
  return {
    reports: emptyReports,
    detail,
    search: { page: 1, pageSize: 20 },
    loading: false,
    detailLoading: false,
    error: false,
    mutationError: false,
    mutating: false,
    onSearchChange: vi.fn(),
    onSelect: vi.fn(),
    onStatusChange: vi.fn(),
    onAssign: vi.fn(),
    onUnassign: vi.fn(),
    ...overrides,
  };
}
