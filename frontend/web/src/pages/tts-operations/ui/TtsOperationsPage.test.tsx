/** TTS 작업 목록의 상태·빈 상태·반응형 표현을 검증한다 */
import type { TtsJobListResponse } from '@flex-thia/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});

function renderView(items: TtsJobListResponse['items']) {
  return render(
    <TtsOperationsPageView
      data={{
        items,
        page: {
          page: 1,
          pageSize: 20,
          totalItems: items.length,
          totalPages: 1,
        },
      }}
      error={null}
      loading={false}
      onRetry={() => undefined}
    />,
  );
}
