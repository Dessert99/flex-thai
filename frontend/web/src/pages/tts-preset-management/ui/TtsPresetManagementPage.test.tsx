/** TTS preset enabled와 configured active 상태를 독립적으로 표시하는지 검증한다 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { TtsPresetManagementPageView } from './TtsPresetManagementPageView';

describe('TTS preset 관리 화면', () => {
  it('active row의 disable 행동을 설명과 함께 막는다', () => {
    renderWithProviders(
      <TtsPresetManagementPageView
        data={{
          items: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              name: 'thai-default',
              provider: 'local',
              model: 'v1',
              voice: 'thai',
              locale: 'th-TH',
              audioFormat: 'audio/wav',
              generationRevision: 'r1',
              enabled: true,
              active: true,
              createdAt: '2026-07-28T00:00:00.000Z',
              updatedAt: '2026-07-28T00:00:00.000Z',
            },
          ],
          page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        }}
        error={null}
        loading={false}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: '비활성화' })).toBeDisabled();
    expect(
      screen.getByText('active preset은 비활성화할 수 없습니다.'),
    ).toBeVisible();
  });
});
