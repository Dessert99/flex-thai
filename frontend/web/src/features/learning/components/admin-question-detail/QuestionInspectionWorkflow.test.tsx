import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQuestionDetail,
  questionId,
} from './AdminQuestionDetailPage.fixtures';
import { AdminQuestionDetailPageContainer } from './AdminQuestionDetailPageContainer';

interface MockRequest {
  headers?: HeadersInit;
  path: string;
}

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn<(request: MockRequest) => Promise<unknown>>(),
}));

vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('관리자 문제 inspection workflow', () => {
  it('실제 문제 preview를 keyboard 선택 가능하게 표시하고 두 버전 차이를 비교한다', async () => {
    mockDetail();
    const user = userEvent.setup();

    renderDetail();

    expect(
      await screen.findByRole('region', {
        name: '버전 3 문제 미리보기',
      }),
    ).toBeVisible();
    const option = screen.getAllByRole('radio')[0];
    if (!option) throw new Error('preview 선택지가 필요합니다.');
    option.focus();
    await user.keyboard('[Space]');
    expect(option).toBeChecked();
    expect(screen.getByText('본문 변경')).toBeVisible();
    expect(screen.getByText('상태 변경')).toBeVisible();
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminQuestionDetailPageContainer questionId={questionId} />,
  );
}

function mockDetail() {
  mocks.authenticatedRequest.mockResolvedValue(createQuestionDetail());
}
