/* eslint-disable max-lines -- 일곱 query의 부분 성공과 빈 상태를 한 화면 계약으로 검증한다. */
/** 관리자 홈의 최근 콘텐츠·감사 기록·부분 실패·빈 상태·내비게이션 경계를 검증한다 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { AdminHomePageContainer } from './AdminHomePageContainer';

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const page = {
  page: 1,
  pageSize: 3,
  totalItems: 1,
  totalPages: 1,
};
const emptyPage = { ...page, totalItems: 0, totalPages: 0 };

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mockHomeResponses(
    { items: [], page: emptyPage },
    { items: [], page: emptyPage },
    { items: [], page: { ...emptyPage, pageSize: 5 } },
  );
});

describe('관리자 홈 페이지', () => {
  it('최근 문제와 어휘를 표시하고 지원하지 않는 지표를 만들지 않는다', async () => {
    mockHomeResponses(
      {
        items: [
          {
            questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
            status: 'DRAFT',
            currentPublishedVersionId: null,
            latestVersion: 1,
            latestVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
            latestVersionStatus: 'DRAFT',
            validationStatus: 'PENDING',
            questionTypeSlug: 'reading-context',
            difficulty: 2,
            updatedAt: '2026-07-25T00:00:00.000Z',
          },
        ],
        page,
      },
      {
        items: [
          {
            id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
            thai: 'โรงเรียน',
            kind: 'WORD',
            status: 'PUBLISHED',
            meaningCount: 1,
            pronunciationCount: 1,
            updatedAt: '2026-07-25T00:00:00.000Z',
          },
        ],
        page,
      },
      {
        items: [
          {
            id: '01933b6a-8f13-7a19-b7e5-536d70f57aae',
            actor: {
              kind: 'SYSTEM',
              label: '로컬 시스템',
            },
            action: 'QUESTION_PUBLISHED',
            target: '문제: reading-context',
            targetType: 'QUESTION',
            targetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
            createdAt: '2026-07-25T00:00:00.000Z',
          },
        ],
        page: { ...page, pageSize: 5 },
      },
    );

    renderAdminHome();

    expect(
      await screen.findByRole('link', { name: /reading-context/u }),
    ).toHaveAttribute(
      'href',
      '/admin/questions/01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    );
    expect(screen.getByText('โรงเรียน')).toHaveAttribute('lang', 'th');
    expect(
      screen.queryByText(/승인 대기|사용자 수|완료율/u),
    ).not.toBeInTheDocument();
    expect(screen.getByText('로컬 시스템')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '감사 기록 열기' }),
    ).toHaveAttribute('href', '/admin/audit-logs');
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/admin/audit-logs?page=1&pageSize=5' }),
    );
  });
});

// eslint-disable-next-line max-lines-per-function -- 일곱 query 실패 조합을 같은 fixture로 검증한다.
describe('관리자 홈 부분 실패', () => {
  it('비용 카드가 실패해도 다른 운영 카드와 빠른 진입을 유지한다', async () => {
    mockHomeResponses(
      { items: [], page: emptyPage },
      { items: [], page: emptyPage },
      { items: [], page: { ...emptyPage, pageSize: 5 } },
      {
        items: [
          {
            id: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
            purpose: 'QUESTION_GENERATION',
            status: 'RUNNING',
            attempt: 0,
            createdAt: '2026-07-25T00:00:00.000Z',
            completedAt: null,
            counts: {
              total: 2,
              succeeded: 0,
              needsAttention: 0,
              failed: 0,
            },
          },
        ],
      },
      {
        items: [],
        page: { ...emptyPage, pageSize: 1, totalItems: 4, totalPages: 4 },
      },
      {
        items: [
          {
            id: '01933b6a-8f13-7a19-b7e5-536d70f57ab2',
            status: 'FAILED',
            requestedBy: '01933b6a-8f13-7a19-b7e5-536d70f57ab3',
            counts: {
              pending: 0,
              processing: 0,
              succeeded: 0,
              failed: 1,
            },
            createdAt: '2026-07-25T00:00:00.000Z',
            startedAt: '2026-07-25T00:00:01.000Z',
            finishedAt: '2026-07-25T00:00:02.000Z',
          },
        ],
        page,
      },
      new Error('usage cost failed'),
    );

    renderAdminHome();

    expect(
      await screen.findByText('현재 월 비용을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('검토 대기 4건')).toBeInTheDocument();
    expect(screen.getByText('실행 중 1건 · 실패 0건')).toBeInTheDocument();
    expect(screen.getByText('실행 중 0건 · 실패 1건')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '후보 검수 열기' }),
    ).toHaveAttribute('href', '/admin/content-production/candidates');
    expect(
      screen.getByRole('link', { name: 'TTS retry 열기' }),
    ).toHaveAttribute('href', '/admin/tts?status=FAILED&page=1&pageSize=20');
  });

  it('최근 어휘 요청이 실패해도 최근 문제는 유지한다', async () => {
    mockHomeResponses(
      {
        items: [
          {
            questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
            status: 'DRAFT',
            currentPublishedVersionId: null,
            latestVersion: 1,
            latestVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
            latestVersionStatus: 'DRAFT',
            validationStatus: 'PENDING',
            questionTypeSlug: 'listening-dialogue',
            difficulty: 3,
            updatedAt: '2026-07-25T00:00:00.000Z',
          },
        ],
        page,
      },
      new Error('vocabulary failed'),
      {
        items: [],
        page: { ...page, pageSize: 5, totalItems: 0, totalPages: 0 },
      },
    );

    renderAdminHome();

    expect(await screen.findByText('listening-dialogue')).toBeInTheDocument();
    expect(
      screen.getByText('최근 어휘를 불러오지 못했습니다.'),
    ).toBeInTheDocument();
  });

  it('최근 감사 기록 요청이 실패해도 기존 콘텐츠 카드를 유지한다', async () => {
    mockHomeResponses(
      {
        items: [
          {
            questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
            status: 'DRAFT',
            currentPublishedVersionId: null,
            latestVersion: 1,
            latestVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
            latestVersionStatus: 'DRAFT',
            validationStatus: 'PENDING',
            questionTypeSlug: 'reading-context',
            difficulty: 2,
            updatedAt: '2026-07-25T00:00:00.000Z',
          },
        ],
        page,
      },
      { items: [], page: { ...page, totalItems: 0, totalPages: 0 } },
      new Error('audit failed'),
    );

    renderAdminHome();

    expect(await screen.findByText('reading-context')).toBeInTheDocument();
    expect(
      screen.getByText('최근 감사 기록을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
  });
});

describe('관리자 홈 빈 상태', () => {
  it('두 최근 목록이 모두 비면 콘텐츠 작성 경로를 안내한다', async () => {
    renderAdminHome();

    expect(
      await screen.findByRole('heading', {
        name: '아직 표시할 관리 콘텐츠가 없습니다.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '문제 관리 열기' }),
    ).toHaveAttribute('href', '/admin/questions');
  });
});

function renderAdminHome() {
  return renderWithProviders(<AdminHomePageContainer />);
}

function mockHomeResponses(
  questionResponse: unknown,
  vocabularyResponse: unknown,
  auditResponse: unknown,
  contentJobsResponse: unknown = { items: [] },
  candidatesResponse: unknown = {
    items: [],
    page: { ...emptyPage, pageSize: 1 },
  },
  ttsJobsResponse: unknown = {
    items: [],
    page,
  },
  usageCostResponse: unknown = {
    range: {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    },
    estimatedCostUsd: '0.000000',
    inProgressJobCount: 0,
    failedRunCount: 0,
    pendingReviewCandidateCount: 0,
    breakdown: [],
    currentMonthThreshold: {
      range: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      },
      estimatedCostUsd: '0.000000',
      status: 'NORMAL',
    },
  },
) {
  mocks.authenticatedRequest.mockImplementation(
    ({ path }: { path: string }) => {
      const response = resolveHomeResponse(
        path,
        questionResponse,
        vocabularyResponse,
        auditResponse,
        contentJobsResponse,
        candidatesResponse,
        ttsJobsResponse,
        usageCostResponse,
      );
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response);
    },
  );
}

function resolveHomeResponse(
  path: string,
  questionResponse: unknown,
  vocabularyResponse: unknown,
  auditResponse: unknown,
  contentJobsResponse: unknown,
  candidatesResponse: unknown,
  ttsJobsResponse: unknown,
  usageCostResponse: unknown,
) {
  if (path.startsWith('/admin/content-production/question-candidates')) {
    return candidatesResponse;
  }
  if (path.startsWith('/admin/content-production/jobs')) {
    return contentJobsResponse;
  }
  if (path.startsWith('/admin/tts/jobs')) {
    return ttsJobsResponse;
  }
  if (path.startsWith('/admin/usage-cost')) {
    return usageCostResponse;
  }
  if (path.startsWith('/admin/questions')) {
    return questionResponse;
  }
  if (path.startsWith('/admin/audit-logs')) {
    return auditResponse;
  }
  return vocabularyResponse;
}
