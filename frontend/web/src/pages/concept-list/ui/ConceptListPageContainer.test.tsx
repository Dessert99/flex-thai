/** 학습자 개념 목록 Container의 query 상태와 재시도를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { ConceptListPageContainer } from './ConceptListPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('ConceptListPageContainer', () => {
  it('선택 영역의 게시 개념을 query해 카드로 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createConceptList());

    renderWithProviders(
      <ConceptListPageContainer
        category='GRAMMAR'
        onCategoryChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('기본 어순')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /기본 어순/ })).toHaveAttribute(
      'href',
      '/concepts/11111111-1111-4111-8111-111111111111',
    );
  });

  it('목록 실패 뒤 사용자가 다시 시도하면 같은 영역을 refetch한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(createConceptList());

    renderWithProviders(
      <ConceptListPageContainer
        category='GRAMMAR'
        onCategoryChange={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('기본 어순')).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });
});

function createConceptList() {
  return {
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        category: 'GRAMMAR',
        position: 0,
        title: '기본 어순',
        summary: '태국어 기본 어순',
      },
    ],
  };
}
