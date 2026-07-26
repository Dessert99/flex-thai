/** 관리자 오류 신고 Container의 query·선택·command 연결을 검증한다 */
import type {
  AdminContentErrorReportDetailResponse,
  AdminContentErrorReportListResponse,
} from '@flex-thia/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, renderWithProviders } from '@/shared/test';
import { ContentErrorReportManagementPageContainer } from './ContentErrorReportManagementPageContainer';

interface CapturedRequest {
  method?: string;
  path: string;
  body?: unknown;
}

const requests = vi.hoisted(() => ({
  authenticatedRequest: vi.fn<(request: CapturedRequest) => Promise<unknown>>(),
}));
const ids = {
  report: '00000000-0000-4000-8000-000000000001',
  reporter: '00000000-0000-4000-8000-000000000002',
  assignee: '00000000-0000-4000-8000-000000000003',
  content: '00000000-0000-4000-8000-000000000004',
};

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: requests.authenticatedRequest };
});

beforeEach(() => {
  requests.authenticatedRequest.mockReset().mockImplementation(handleRequest);
});

describe('관리자 오류 신고 Container 조회', () => {
  it('검증된 search로 목록을 조회하고 선택한 신고만 상세 조회한다', async () => {
    renderContainer();

    expect(
      await screen.findByRole('button', { name: '문제 · OPEN' }),
    ).toBeVisible();
    expect(getRequestedPaths()).toEqual([
      '/admin/content-error-reports?status=OPEN&page=2&pageSize=10',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '문제 · OPEN' }));

    expect(
      await screen.findByRole('region', { name: '신고 상세' }),
    ).toBeVisible();
    expect(getRequestedPaths()).toContain(
      `/admin/content-error-reports/${ids.report}`,
    );
  });

  it('목록 조회 실패를 관리 화면 오류로 표시한다', async () => {
    requests.authenticatedRequest.mockRejectedValue(new Error('network'));

    renderContainer();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '오류 신고를 불러오지 못했습니다.',
    );
  });
});

describe('관리자 오류 신고 Container command', () => {
  it('상태 변경 성공 뒤 오류 신고 query 전체를 무효화한다', async () => {
    const queryClient = createTestQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    renderContainer(queryClient);
    await openDetail();

    fireEvent.click(screen.getByRole('button', { name: 'IN_PROGRESS' }));

    await waitFor(() =>
      expect(requests.authenticatedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          path: `/admin/content-error-reports/${ids.report}/status`,
          body: { status: 'IN_PROGRESS' },
        }),
      ),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['admin', 'content-error-reports'],
    });
  });

  it('command 실패를 상세 workflow 오류로 표시한다', async () => {
    requests.authenticatedRequest.mockImplementation((request) => {
      if (request.method === 'PUT' && request.path.endsWith('/status')) {
        return Promise.reject(new Error('network'));
      }
      return handleRequest(request);
    });
    renderContainer();
    await openDetail();

    fireEvent.click(screen.getByRole('button', { name: 'IN_PROGRESS' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '변경을 저장하지 못했습니다.',
    );
  });

  it('담당자 교체와 해제를 선택한 신고 ID에 연결한다', async () => {
    const user = userEvent.setup();
    renderContainer();
    await openDetail();
    const assignmentInput = screen.getAllByLabelText('담당자 ID')[1];
    if (!assignmentInput) throw new Error('담당자 입력을 찾지 못했습니다.');
    await user.clear(assignmentInput);
    await user.type(assignmentInput, ids.reporter);

    const assignmentForm = screen
      .getByRole('button', { name: '담당자 교체' })
      .closest('form');
    if (!assignmentForm) throw new Error('담당자 form을 찾지 못했습니다.');
    fireEvent.submit(assignmentForm);
    await waitFor(() =>
      expect(getCommandRequests()).toContainEqual(
        expect.objectContaining({
          method: 'PUT',
          path: `/admin/content-error-reports/${ids.report}/assignee`,
          body: { assigneeUserId: ids.reporter },
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '담당자 해제' }));

    await waitFor(() =>
      expect(getCommandRequests()).toContainEqual(
        expect.objectContaining({
          method: 'DELETE',
          path: `/admin/content-error-reports/${ids.report}/assignee`,
        }),
      ),
    );
  });
});

function renderContainer(queryClient = createTestQueryClient()) {
  return renderWithProviders(
    <ContentErrorReportManagementPageContainer
      onSearchChange={vi.fn()}
      search={{ status: 'OPEN', page: 2, pageSize: 10 }}
    />,
    { queryClient },
  );
}

async function openDetail() {
  fireEvent.click(await screen.findByRole('button', { name: '문제 · OPEN' }));
  await screen.findByRole('region', { name: '신고 상세' });
}

function getRequestedPaths(): string[] {
  return requests.authenticatedRequest.mock.calls.map(
    ([request]) => request.path,
  );
}

function getCommandRequests(): CapturedRequest[] {
  return requests.authenticatedRequest.mock.calls
    .map(([request]) => request)
    .filter((request) => request.method !== undefined);
}

function handleRequest({ method, path }: CapturedRequest) {
  if (method) return Promise.resolve(createDetail());
  if (path === `/admin/content-error-reports/${ids.report}`) {
    return Promise.resolve(createDetail());
  }
  return Promise.resolve(createReports());
}

function createReports(): AdminContentErrorReportListResponse {
  return {
    items: [createSummary()],
    page: { page: 2, pageSize: 10, totalItems: 1, totalPages: 1 },
  };
}

function createDetail(): AdminContentErrorReportDetailResponse {
  return { ...createSummary(), history: [] };
}

function createSummary() {
  return {
    id: ids.report,
    reporter: { id: ids.reporter, email: 'learner@example.com' },
    targetKind: 'QUESTION' as const,
    category: 'OTHER' as const,
    status: 'OPEN' as const,
    assignee: { id: ids.assignee, email: 'admin@example.com' },
    description: '설명이 다릅니다.',
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
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  };
}
