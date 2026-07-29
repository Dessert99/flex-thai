/** TTS 작업 목록의 상태·빈 상태·반응형 표현을 검증한다 */
import type { TtsJobListResponse } from '@flex-thia/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TtsOperationsPageView } from './TtsOperationsPageView';

describe('TTS 작업 목록 화면', () => {
  it('작업을 desktop table과 mobile list에 함께 표시한다', () => {
    renderView([
      {
        id: '00000000-0000-4000-8000-000000000001',
        status: 'FAILED',
        requestedBy: '00000000-0000-4000-8000-000000000002',
        counts: { pending: 0, processing: 0, succeeded: 1, failed: 2 },
        createdAt: '2026-07-28T00:00:00.000Z',
        startedAt: null,
        finishedAt: '2026-07-28T00:01:00.000Z',
      },
    ]);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: '모바일 TTS 작업 목록' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('실패')).toHaveLength(2);
  });

  it('필터 결과 없음과 전체 빈 목록을 구분한다', () => {
    renderView([], {
      search: { page: 1, pageSize: 20, status: 'FAILED' },
    });

    expect(
      screen.getByRole('heading', { name: '조건에 맞는 TTS 작업이 없습니다.' }),
    ).toBeVisible();
    expect(screen.getAllByRole('button', { name: '필터 초기화' })).toHaveLength(
      2,
    );
  });

  it('다음 페이지 이동을 URL 검색 변경으로 전달한다', async () => {
    const onPageChange = vi.fn();
    renderView(
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          status: 'SUCCEEDED',
          requestedBy: '00000000-0000-4000-8000-000000000002',
          counts: { pending: 0, processing: 0, succeeded: 1, failed: 0 },
          createdAt: '2026-07-28T00:00:00.000Z',
          startedAt: '2026-07-28T00:00:01.000Z',
          finishedAt: '2026-07-28T00:01:00.000Z',
        },
      ],
      {
        onPageChange,
        page: {
          page: 1,
          pageSize: 20,
          totalItems: 21,
          totalPages: 2,
        },
      },
    );

    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

function renderView(
  items: TtsJobListResponse['items'],
  overrides: {
    onPageChange?: (page: number) => void;
    page?: TtsJobListResponse['page'];
    search?: {
      status?: 'FAILED';
      page: number;
      pageSize: number;
    };
  } = {},
) {
  return render(
    <TtsOperationsPageView
      data={{
        items,
        page: overrides.page ?? {
          page: 1,
          pageSize: 20,
          totalItems: items.length,
          totalPages: items.length === 0 ? 0 : 1,
        },
      }}
      error={null}
      loading={false}
      onFilterChange={() => undefined}
      onPageChange={overrides.onPageChange ?? (() => undefined)}
      onResetFilters={() => undefined}
      onRetry={() => undefined}
      search={overrides.search ?? { page: 1, pageSize: 20 }}
    />,
  );
}
