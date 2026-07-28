/** TTS preset enabled와 configured active 상태를 독립적으로 표시하는지 검증한다 */
import type { TtsVoicePresetListResponse } from '@flex-thia/contracts';
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

describe('TTS preset stale version 복구', () => {
  it('stale refetch 뒤 입력을 보존하고 최신 revision으로 새 버전을 다시 보낸다', async () => {
    const onCreateVersion = vi.fn().mockResolvedValue(undefined);
    const props = {
      error: null,
      loading: false,
      mutationError: null,
      mutationPending: false,
      onCreate: vi.fn(),
      onCreateVersion,
      onFilterChange: vi.fn(),
      onPageChange: vi.fn(),
      onRetry: vi.fn(),
      onToggle: vi.fn(),
      search: { page: 1, pageSize: 20 },
    } as const;
    const { rerender } = renderWithProviders(
      <TtsPresetManagementPageView
        {...props}
        data={createPage(false)}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '새 버전' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: '새 generation revision' }),
      'r2',
    );

    const refreshed = createPage(false);
    const refreshedPreset = refreshed.items[0];
    if (!refreshedPreset) throw new Error('preset fixture가 필요합니다');
    refreshedPreset.updatedAt = '2026-07-28T00:01:00.000Z';
    rerender(
      <TtsPresetManagementPageView
        {...props}
        data={refreshed}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '새 버전 생성' }));

    expect(onCreateVersion).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({
        expectedUpdatedAt: '2026-07-28T00:01:00.000Z',
        generationRevision: 'r2',
      }),
    );
  });
});

function createPage(active: boolean): TtsVoicePresetListResponse {
  return {
    items: [createPreset(active)],
    page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
}

function createPreset(
  active: boolean,
): TtsVoicePresetListResponse['items'][number] {
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
