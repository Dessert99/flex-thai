/* eslint-disable max-lines-per-function -- 운영 집계의 여섯 카드와 부분 실패를 한 화면 계약으로 검증한다. */
/** 관리자 홈의 최근 콘텐츠와 전체 운영 집계·부분 실패·실제 진입 경로를 검증한다 */
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
const emptyOperations = {
  feedback: { pendingCount: 0 },
  candidates: {
    questionPendingCount: 0,
    vocabularyPendingCount: 0,
  },
  contentProduction: { runningCount: 0, failedCount: 0 },
  tts: { runningCount: 0, failedCount: 0 },
  usageCost: { estimatedCostUsd: '0.000000', status: 'NORMAL' },
  mfa: {
    enrolled: true,
    enrolledAt: '2026-07-01T00:00:00.000Z',
    recentVerificationAt: null,
  },
} as const;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mockHomeResponses(
    { items: [], page: emptyPage },
    { items: [], page: emptyPage },
    { items: [], page: { ...emptyPage, pageSize: 5 } },
    emptyOperations,
  );
});

describe('관리자 홈 페이지', () => {
  it('최근 콘텐츠와 전체 운영 집계 및 실제 관리 경로를 표시한다', async () => {
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
            actor: { kind: 'SYSTEM', label: '로컬 시스템' },
            action: 'QUESTION_PUBLISHED',
            target: '문제: reading-context',
            targetType: 'QUESTION',
            targetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
            createdAt: '2026-07-25T00:00:00.000Z',
          },
        ],
        page: { ...page, pageSize: 5 },
      },
      {
        feedback: { pendingCount: 2 },
        candidates: {
          questionPendingCount: 3,
          vocabularyPendingCount: 4,
        },
        contentProduction: { runningCount: 1, failedCount: 2 },
        tts: { runningCount: 5, failedCount: 1 },
        usageCost: { estimatedCostUsd: '16.500000', status: 'WARNING' },
        mfa: {
          enrolled: true,
          enrolledAt: '2026-07-01T00:00:00.000Z',
          recentVerificationAt: null,
        },
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
    expect(screen.getByText('로컬 시스템')).toBeInTheDocument();
    expect(screen.getByText('미처리 2건')).toBeInTheDocument();
    expect(screen.getByText('문제 3건 · 어휘 4건')).toBeInTheDocument();
    expect(screen.getByText('실행 중 1건 · 실패 2건')).toBeInTheDocument();
    expect(screen.getByText('실행 중 5건 · 실패 1건')).toBeInTheDocument();
    expect(screen.getByText('16.500000 USD · WARNING')).toBeInTheDocument();
    expect(
      screen.getByText('등록됨 · 최근 재인증 시각 미추적'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '오류 신고 열기' }),
    ).toHaveAttribute('href', '/admin/content-error-reports');
    expect(
      screen.getByRole('link', { name: '어휘 후보 검수 열기' }),
    ).toHaveAttribute(
      'href',
      '/admin/content-production/vocabulary-candidates',
    );
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/admin/home' }),
    );
  });

  it('운영 집계가 실패해도 최근 문제와 독립 재시도를 유지한다', async () => {
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
      { items: [], page: emptyPage },
      { items: [], page: { ...emptyPage, pageSize: 5 } },
      new Error('home failed'),
    );

    renderAdminHome();

    expect(await screen.findByText('listening-dialogue')).toBeInTheDocument();
    expect(
      screen.getAllByText('운영 상태를 불러오지 못했습니다.'),
    ).toHaveLength(6);
  });

  it('최근 어휘 요청이 실패해도 운영 집계를 유지한다', async () => {
    mockHomeResponses(
      { items: [], page: emptyPage },
      new Error('vocabulary failed'),
      { items: [], page: { ...emptyPage, pageSize: 5 } },
      {
        ...emptyOperations,
        feedback: { pendingCount: 2 },
      },
    );

    renderAdminHome();

    expect(
      await screen.findByText('최근 어휘를 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('미처리 2건')).toBeInTheDocument();
  });

  it('집계가 0이어도 빈 상태와 운영 진입점을 카드별로 표시한다', async () => {
    renderAdminHome();

    expect(
      await screen.findByText('표시할 최근 문제가 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('미처리 0건')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'TTS retry 열기' }),
    ).toHaveAttribute('href', '/admin/tts?status=FAILED&page=1&pageSize=20');
  });
});

function renderAdminHome() {
  return renderWithProviders(<AdminHomePageContainer />);
}

function mockHomeResponses(
  questionResponse: unknown,
  vocabularyResponse: unknown,
  auditResponse: unknown,
  operationsResponse: unknown,
) {
  mocks.authenticatedRequest.mockImplementation(
    ({ path }: { path: string }) => {
      const response = resolveHomeResponse(path, {
        auditResponse,
        operationsResponse,
        questionResponse,
        vocabularyResponse,
      });
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response);
    },
  );
}

function resolveHomeResponse(
  path: string,
  responses: {
    auditResponse: unknown;
    operationsResponse: unknown;
    questionResponse: unknown;
    vocabularyResponse: unknown;
  },
) {
  if (path.startsWith('/admin/home')) return responses.operationsResponse;
  if (path.startsWith('/admin/questions')) return responses.questionResponse;
  if (path.startsWith('/admin/audit-logs')) return responses.auditResponse;
  return responses.vocabularyResponse;
}
