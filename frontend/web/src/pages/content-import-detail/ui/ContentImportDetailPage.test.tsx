/** 콘텐츠 가져오기 상세의 항목별 성공·실패 표시를 검증한다 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { ContentImportDetailPageContainer } from './ContentImportDetailPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

describe('콘텐츠 가져오기 상세 페이지', () => {
  it('가져온 항목과 거절 항목의 안정 오류 path를 함께 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      id: '01933b6a-8f13-7a19-b7e5-536d70f57abb',
      status: 'COMPLETED_WITH_FAILURES',
      vocabularyCount: 1,
      questionCount: 1,
      importedCount: 1,
      rejectedCount: 1,
      createdAt: '2026-07-25T00:00:00.000Z',
      completedAt: '2026-07-25T00:00:01.000Z',
      items: [
        {
          kind: 'VOCABULARY',
          sourceIndex: 0,
          status: 'IMPORTED',
          targetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
          errors: [],
        },
        {
          kind: 'QUESTION',
          sourceIndex: 0,
          status: 'REJECTED',
          targetId: null,
          errors: [{ path: 'options.0', code: 'OPTION_INVALID' }],
        },
      ],
    });

    renderWithProviders(
      <ContentImportDetailPageContainer importId='01933b6a-8f13-7a19-b7e5-536d70f57abb' />,
    );

    expect(await screen.findByText('가져옴')).toBeInTheDocument();
    expect(screen.getByText('거절됨')).toBeInTheDocument();
    expect(screen.getByText('options.0 · OPTION_INVALID')).toBeInTheDocument();
  });
});
