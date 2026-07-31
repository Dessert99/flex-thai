/** 콘텐츠 제작 preset 운영 화면의 history와 revision command를 검증한다 */
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { ContentProductionPresetManagementPageContainer } from './ContentProductionPresetManagementPageContainer';

const preset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '어휘',
  version: 1,
  purpose: 'VOCABULARY_EXTRACTION',
  parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
  enabled: false,
  revision: 4,
  createdAt: '2026-07-28T00:00:00.000Z',
} satisfies ContentProductionPresetVersion;

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

// eslint-disable-next-line max-lines-per-function -- 실제 query와 세 command 복구 경로를 같은 server fixture로 검증한다.
describe('콘텐츠 제작 preset 관리 화면', () => {
  it('현재 revision으로 활성화하고 처리 중 잠근 뒤 갱신된 목록을 표시한다', async () => {
    const command = createDeferred<ContentProductionPresetVersion>();
    let commandRequest: RequestOptions | undefined;
    let serverPreset: ContentProductionPresetVersion = preset;
    mocks.authenticatedRequest.mockImplementation((options: RequestOptions) => {
      if (options.method === 'POST') {
        commandRequest = options;
        return command.promise;
      }
      return Promise.resolve({ items: [serverPreset] });
    });
    const user = userEvent.setup();

    renderWithProviders(<ContentProductionPresetManagementPageContainer />);
    const enableButton = await screen.findByRole('button', {
      name: '활성화',
    });
    await user.click(enableButton);

    expect(enableButton).toBeDisabled();
    expect(commandRequest).toMatchObject({
      body: {
        enabled: true,
        expectedRevision: 4,
      },
      method: 'POST',
      path: `/admin/content-production/presets/${preset.id}/enabled`,
    });
    expect(typeof requestBody(commandRequest).requestId).toBe('string');

    serverPreset = { ...preset, enabled: true, revision: 5 };
    command.resolve(serverPreset);

    expect(
      await screen.findByRole('button', { name: '비활성화' }),
    ).toBeEnabled();
    expect(screen.getByText('5')).toBeVisible();
    expect(screen.getByText('활성')).toBeVisible();
  });

  it('409 충돌 뒤 다시 조회한 최신 revision으로 명령을 재시도한다', async () => {
    let listRequestCount = 0;
    let mutationRequestCount = 0;
    let latestCommand: RequestOptions | undefined;
    let serverPreset: ContentProductionPresetVersion = preset;
    mocks.authenticatedRequest.mockImplementation((options: RequestOptions) => {
      if (options.method === 'POST') {
        mutationRequestCount += 1;
        latestCommand = options;
        if (mutationRequestCount === 1) {
          serverPreset = { ...preset, enabled: true, revision: 5 };
          return Promise.reject(createConflictError());
        }
        serverPreset = { ...serverPreset, enabled: false, revision: 6 };
        return Promise.resolve(serverPreset);
      }
      listRequestCount += 1;
      if (listRequestCount === 2) {
        return Promise.reject(new Error('목록 갱신 실패'));
      }
      return Promise.resolve({ items: [serverPreset] });
    });
    const user = userEvent.setup();

    renderWithProviders(<ContentProductionPresetManagementPageContainer />);
    await user.click(await screen.findByRole('button', { name: '활성화' }));

    expect(
      await screen.findByText(
        '다른 관리자가 먼저 변경했습니다. 최신 revision을 확인해 주세요.',
      ),
    ).toBeVisible();
    await waitFor(() => expect(listRequestCount).toBe(2));

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(
      await screen.findByRole('button', { name: '비활성화' }),
    ).toBeEnabled();
    expect(screen.getByText('5')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '비활성화' }));

    await waitFor(() =>
      expect(latestCommand).toMatchObject({
        body: {
          enabled: false,
          expectedRevision: 5,
        },
        method: 'POST',
        path: `/admin/content-production/presets/${preset.id}/enabled`,
      }),
    );
    expect(typeof requestBody(latestCommand).requestId).toBe('string');
    expect(await screen.findByText('6')).toBeVisible();
    expect(screen.getByText('비활성')).toBeVisible();
    expect(
      screen.queryByText(
        '다른 관리자가 먼저 변경했습니다. 최신 revision을 확인해 주세요.',
      ),
    ).not.toBeInTheDocument();
  });

  it('선택한 preset ID와 수정한 정책으로 다음 버전을 만들고 목록을 갱신한다', async () => {
    let commandRequest: RequestOptions | undefined;
    let versions: ContentProductionPresetVersion[] = [preset];
    mocks.authenticatedRequest.mockImplementation((options: RequestOptions) => {
      if (options.method === 'POST') {
        commandRequest = options;
        const nextVersion: ContentProductionPresetVersion = {
          ...preset,
          version: 2,
          parameters: { suspectedDuplicateMaxCodePointDistance: 2 },
          revision: 5,
          createdAt: '2026-07-28T01:00:00.000Z',
        };
        versions = [nextVersion, preset];
        return Promise.resolve(nextVersion);
      }
      return Promise.resolve({ items: versions });
    });
    const user = userEvent.setup();

    renderWithProviders(<ContentProductionPresetManagementPageContainer />);
    await user.click(await screen.findByRole('button', { name: 'vNext' }));
    const distanceInput =
      screen.getByLabelText('중복 의심 최대 코드 포인트 거리');
    await user.clear(distanceInput);
    await user.type(distanceInput, '2');
    await user.click(screen.getByRole('button', { name: '새 버전 만들기' }));

    expect(commandRequest).toMatchObject({
      body: {
        parameters: { suspectedDuplicateMaxCodePointDistance: 2 },
        purpose: 'VOCABULARY_EXTRACTION',
      },
      method: 'POST',
      path: `/admin/content-production/presets/${preset.id}/versions`,
    });
    expect(typeof requestBody(commandRequest).requestId).toBe('string');
    expect(await screen.findByText('v2')).toBeVisible();
  });
});

interface RequestOptions {
  body?: unknown;
  method?: string;
  path: string;
}

function requestBody(request: RequestOptions | undefined) {
  if (
    !request?.body ||
    typeof request.body !== 'object' ||
    !('requestId' in request.body)
  ) {
    throw new Error('command body가 필요합니다');
  }
  return request.body;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function createConflictError() {
  return new ApiError({
    kind: 'problem',
    problem: {
      code: 'CONTENT_PRODUCTION_PRESET_STALE_REVISION',
      fieldErrors: [],
      requestId: 'request-id',
      status: 409,
      title: 'Conflict',
      type: 'about:blank',
    },
  });
}
