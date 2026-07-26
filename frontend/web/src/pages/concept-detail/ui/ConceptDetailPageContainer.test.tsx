/** 학습자 개념 상세 Container의 404 구분과 재시도를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { ConceptDetailPageContainer } from './ConceptDetailPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/features/report-content-error', () => ({
  ContentErrorReportDialog: () => null,
}));

vi.mock('@/features/explore-thai-content', () => ({
  InteractiveThaiSentence: () => null,
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('ConceptDetailPageContainer', () => {
  it('404 problem을 게시 개념 없음 상태로 구분한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(createProblemError(404));

    renderDetail();

    expect(
      await screen.findByText('게시된 개념을 찾을 수 없습니다.'),
    ).toBeInTheDocument();
  });

  it('일반 실패 뒤 다시 시도하면 상세를 refetch해 표시한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest
      .mockRejectedValueOnce(createProblemError(500))
      .mockResolvedValueOnce(createConceptDetail());

    renderDetail();

    expect(
      await screen.findByText('개념을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('기본 어순')).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });
});

function renderDetail() {
  return renderWithProviders(
    <ConceptDetailPageContainer conceptId='11111111-1111-4111-8111-111111111111' />,
  );
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '개념 조회 실패',
      status,
      code: 'CONCEPT_NOT_FOUND',
      requestId: 'request-concept',
      fieldErrors: [],
    },
  });
}

function createConceptDetail() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    versionId: '22222222-2222-4222-8222-222222222222',
    category: 'GRAMMAR',
    position: 0,
    title: '기본 어순',
    summary: '태국어 기본 어순',
    tableOfContents: [],
    blocks: [],
  };
}
