/** 관리자 문제 목록의 계약 필터·상태·반응형 표현을 검증한다 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import {
  parseAdminQuestionSearch,
  type AdminQuestionSearch,
} from '../model/adminQuestionSearch';
import { QuestionManagementPageContainer } from './QuestionManagementPageContainer';

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));
const defaultSearch: AdminQuestionSearch = { page: 1, pageSize: 20 };

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue(createEmptyPage());
});

describe('관리자 문제 검색 계약', () => {
  it('모든 공개 필터 이름을 그대로 관리자 API query에 보낸다', async () => {
    renderManagementPage({
      difficulty: 4,
      page: 2,
      pageSize: 50,
      questionTypeSlug: 'dialogue-choice',
      skill: 'LISTENING',
      status: 'HIDDEN',
      validationStatus: 'FAILED',
      versionStatus: 'INVALIDATED',
    });

    await screen.findByRole('heading', {
      name: '조건에 맞는 문제가 없습니다.',
    });
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path:
          '/admin/questions?status=HIDDEN&versionStatus=INVALIDATED' +
          '&validationStatus=FAILED&questionTypeSlug=dialogue-choice' +
          '&skill=LISTENING&difficulty=4&page=2&pageSize=50',
      }),
    );
  });

  it('지원하지 않는 키와 잘못된 URL 값을 거부한다', () => {
    expect(() => parseAdminQuestionSearch({ sort: 'newest' })).toThrow();
    expect(() => parseAdminQuestionSearch({ status: 'ACTIVE' })).toThrow();
    expect(() => parseAdminQuestionSearch({ difficulty: '6' })).toThrow();
    expect(() => parseAdminQuestionSearch({ pageSize: '101' })).toThrow();
  });
});

describe('관리자 문제 목록 상태', () => {
  it('문제와 검증 상태를 semantic Badge로 표시하고 모바일 기록도 제공한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestionPage());

    renderManagementPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: '모바일 문제 목록' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table').closest('.hidden')).toHaveClass(
      'hidden',
      'md:block',
    );
    expect(screen.getByRole('list', { name: '모바일 문제 목록' })).toHaveClass(
      'md:hidden',
    );
    expect(
      screen.getAllByText('게시')[0]?.closest('[data-slot=badge]'),
    ).toHaveAttribute('data-variant', 'secondary');
    expect(
      screen.getAllByText('검증 실패')[0]?.closest('[data-slot=badge]'),
    ).toHaveAttribute('data-variant', 'destructive');
  });

  it('필터 없는 빈 목록과 필터 결과 없음 안내를 구분한다', async () => {
    const { unmount } = renderManagementPage();
    expect(
      await screen.findByRole('heading', {
        name: '등록된 문제가 없습니다.',
      }),
    ).toBeInTheDocument();
    unmount();

    renderManagementPage({ ...defaultSearch, status: 'DRAFT' });
    expect(
      await screen.findByRole('heading', {
        name: '조건에 맞는 문제가 없습니다.',
      }),
    ).toBeInTheDocument();
  });
});

function renderManagementPage(search: AdminQuestionSearch = defaultSearch) {
  return renderWithProviders(
    <QuestionManagementPageContainer
      onSearchChange={vi.fn()}
      search={search}
    />,
  );
}

function createEmptyPage() {
  return {
    items: [],
    page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
  };
}

function createQuestionPage() {
  return {
    items: [
      {
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        status: 'PUBLISHED',
        currentPublishedVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
        latestVersion: 3,
        latestVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        latestVersionStatus: 'DRAFT',
        validationStatus: 'FAILED',
        questionTypeSlug: 'dialogue-choice',
        difficulty: 4,
        updatedAt: '2026-07-25T00:00:00.000Z',
      },
    ],
    page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
}
