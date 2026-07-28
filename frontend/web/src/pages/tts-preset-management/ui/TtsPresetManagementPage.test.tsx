/** TTS preset enabled와 configured active 상태를 독립적으로 표시하는지 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { TtsPresetManagementPageContainer } from './TtsPresetManagementPageContainer';
import { TtsPresetManagementPageView } from './TtsPresetManagementPageView';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

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
        mutationError={null}
        mutationPending={false}
        onCreate={vi.fn()}
        onCreateVersion={vi.fn()}
        onFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onRetry={() => undefined}
        onToggle={vi.fn()}
        search={{ page: 1, pageSize: 20 }}
      />,
    );
    expect(screen.getByRole('button', { name: '비활성화' })).toBeDisabled();
    expect(
      screen.getByText('active preset은 비활성화할 수 없습니다.'),
    ).toBeVisible();
  });

  it('현재 revision으로 non-active preset을 비활성화한다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) =>
        Promise.resolve(
          method === 'POST' ? createPreset(false) : createPage(false),
        ),
    );
    renderWithProviders(
      <TtsPresetManagementPageContainer
        onSearchChange={vi.fn()}
        search={{ page: 1, pageSize: 20 }}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '비활성화' }),
    );

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { expectedUpdatedAt: '2026-07-28T00:00:00.000Z' },
        method: 'POST',
        path: '/admin/tts/presets/00000000-0000-4000-8000-000000000001/disable',
      }),
    );
  });
});

function createPage(active: boolean) {
  return {
    items: [createPreset(active)],
    page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
}

function createPreset(active: boolean) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'thai-default',
    provider: 'local',
    model: 'v1',
    voice: 'thai',
    locale: 'th-TH',
    audioFormat: 'audio/wav',
    generationRevision: 'r1',
    enabled: true,
    active,
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
  };
}
