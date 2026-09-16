/** 관리자 문제 상세의 404·검증 보고서·불변 버전 표현을 검증한다 */
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQuestionDetail,
  draftVersionId,
  questionId,
} from './AdminQuestionDetailPage.fixtures';
import { AdminQuestionDetailPageContainer } from './AdminQuestionDetailPageContainer';

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('관리자 문제 상세', () => {
  it('검증을 통과한 초안에 게시 버튼을 제공한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(
      createQuestionDetail({ draftValidationStatus: 'PASSED' }),
    );
    renderDetail();
    expect(
      await screen.findByRole('button', { name: '버전 게시' }),
    ).toBeEnabled();
  });
  it('검증에 실패한 초안에는 게시 버튼을 제공하지 않는다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestionDetail());
    renderDetail();
    await screen.findByRole('link', { name: '버전 3 전체 교체' });
    expect(
      screen.queryByRole('button', { name: '버전 게시' }),
    ).not.toBeInTheDocument();
  });
  it('404 응답을 존재하지 않는 문제로 안전하게 안내한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(createProblemError(404));

    renderDetail();

    expect(
      await screen.findByText('요청한 문제를 찾을 수 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('요청 ID: request-question')).toBeInTheDocument();
  });

  it('FAILED 검증 issue의 안정 path와 code를 표시한다', () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestionDetail());

    renderDetail();
  });

  it('DRAFT에만 전체 교체 링크를 제공해 게시 버전을 직접 편집하지 않는다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestionDetail());

    renderDetail();

    expect(
      await screen.findByRole('link', { name: '버전 3 전체 교체' }),
    ).toHaveAttribute(
      'href',
      `/admin/questions/${questionId}/versions/${draftVersionId}/replace?page=1&pageSize=20`,
    );
    expect(
      screen.queryByRole('link', { name: '버전 2 전체 교체' }),
    ).not.toBeInTheDocument();
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminQuestionDetailPageContainer questionId={questionId} />,
  );
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '문제를 찾을 수 없습니다.',
      status,
      code: 'QUESTION_NOT_FOUND',
      requestId: 'request-question',
      fieldErrors: [],
    },
  });
}
