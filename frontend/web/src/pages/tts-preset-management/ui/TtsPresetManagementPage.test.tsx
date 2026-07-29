/** TTS preset enabled와 configured active 상태를 독립적으로 표시하는지 검증한다 */
import type { TtsVoicePresetListResponse } from '@flex-thia/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
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
        onCancelVersion={vi.fn()}
        onCreate={vi.fn()}
        onCreateVersion={vi.fn()}
        onFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onRetry={() => undefined}
        onSelectVersion={vi.fn()}
        onToggle={vi.fn()}
        search={{ page: 1, pageSize: 20 }}
        versionSource={null}
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

// eslint-disable-next-line max-lines-per-function -- view revision과 실제 409 query 복구를 같은 fixture로 검증한다.
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
      onCancelVersion: vi.fn(),
      onFilterChange: vi.fn(),
      onPageChange: vi.fn(),
      onRetry: vi.fn(),
      onSelectVersion: vi.fn(),
      onToggle: vi.fn(),
      search: { page: 1, pageSize: 20 },
    } as const;
    const { rerender } = renderWithProviders(
      <TtsPresetManagementPageView
        {...props}
        data={createPage(false)}
        versionSource={createPreset(false)}
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
        versionSource={refreshedPreset}
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

  it('409 뒤 source가 현재 목록에서 사라져도 입력과 최신 revision을 보존한다', async () => {
    let detailRequestCount = 0;
    let listRequestCount = 0;
    let versionRequestBody: unknown;
    let versionRequestCount = 0;
    mocks.authenticatedRequest.mockImplementation(
      ({
        body,
        method,
        path,
      }: {
        body?: unknown;
        method?: string;
        path: string;
      }) => {
        if (method === 'POST' && path.endsWith('/versions')) {
          versionRequestBody = body;
          versionRequestCount += 1;
          if (versionRequestCount === 1) {
            return Promise.reject(stalePresetError());
          }
          return Promise.resolve({
            ...createPreset(false),
            generationRevision: 'r2',
            updatedAt: '2026-07-28T00:02:00.000Z',
          });
        }
        if (path.includes('/presets?')) {
          listRequestCount += 1;
          return Promise.resolve(
            listRequestCount === 1
              ? createPage(false)
              : {
                  items: [],
                  page: {
                    page: 1,
                    pageSize: 20,
                    totalItems: 0,
                    totalPages: 0,
                  },
                },
          );
        }
        if (path.endsWith('/00000000-0000-4000-8000-000000000001')) {
          detailRequestCount += 1;
          return Promise.resolve({
            ...createPreset(false),
            updatedAt:
              detailRequestCount === 1
                ? '2026-07-28T00:00:00.000Z'
                : '2026-07-28T00:01:00.000Z',
          });
        }
        throw new Error(`예상하지 못한 요청: ${method ?? 'GET'} ${path}`);
      },
    );
    const user = userEvent.setup();
    renderWithProviders(
      <TtsPresetManagementPageContainer
        onSearchChange={vi.fn()}
        search={{ enabled: true, page: 1, pageSize: 20 }}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '새 버전' }));
    const revisionInput = await screen.findByRole('textbox', {
      name: '새 generation revision',
    });
    await user.type(revisionInput, 'r2');
    await user.click(screen.getByRole('button', { name: '새 버전 생성' }));

    expect(
      await screen.findByText(
        '다른 변경이 먼저 반영되었습니다. 목록을 갱신했으니 다시 확인해 주세요.',
      ),
    ).toBeVisible();
    expect(
      await screen.findByRole('heading', {
        name: '조건에 맞는 TTS preset이 없습니다.',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: '새 generation revision' }),
    ).toHaveValue('r2');
    await waitFor(() => expect(detailRequestCount).toBeGreaterThanOrEqual(2));

    await user.click(screen.getByRole('button', { name: '새 버전 생성' }));

    await waitFor(() => expect(versionRequestCount).toBe(2));
    expect(versionRequestBody).toMatchObject({
      expectedUpdatedAt: '2026-07-28T00:01:00.000Z',
      generationRevision: 'r2',
    });
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

function stalePresetError() {
  return new ApiError({
    kind: 'problem',
    problem: {
      code: 'TTS_VOICE_PRESET_STALE_REVISION',
      fieldErrors: [],
      requestId: 'request-id',
      status: 409,
      title: 'Conflict',
      type: 'about:blank',
    },
  });
}
