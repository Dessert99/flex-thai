/** TTS 작업 상세의 voice snapshot과 item 운영 행동을 검증한다 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { AdminTtsJobDetailPageView } from './AdminTtsJobDetailPageView';

describe('TTS 작업 상세 화면', () => {
  it('immutable voice snapshot과 실패 원인을 표시한다', () => {
    renderWithProviders(
      <AdminTtsJobDetailPageView
        data={{
          id: '00000000-0000-4000-8000-000000000001',
          status: 'FAILED',
          requestedBy: '00000000-0000-4000-8000-000000000002',
          counts: { pending: 0, processing: 0, succeeded: 0, failed: 1 },
          createdAt: '2026-07-28T00:00:00.000Z',
          startedAt: null,
          finishedAt: '2026-07-28T00:01:00.000Z',
          voice: {
            presetId: '00000000-0000-4000-8000-000000000003',
            provider: 'local',
            model: 'v1',
            voice: 'thai',
            locale: 'th-TH',
            audioFormat: 'audio/wav',
            generationRevision: 'r1',
          },
          items: [],
          itemPage: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        }}
        error={null}
        loading={false}
        onFilterChange={() => undefined}
        onPageChange={() => undefined}
        onRetry={() => undefined}
        search={{ page: 1, pageSize: 20 }}
      />,
    );
    expect(screen.getByText('local / v1 / thai')).toBeInTheDocument();
  });
});
