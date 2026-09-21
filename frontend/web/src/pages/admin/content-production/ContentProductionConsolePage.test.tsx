import {
  renderWithProviders as render,
  renderWithProviders,
} from '@/shared/test/renderWithProviders';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentProductionConsolePage as ContentProductionConsolePageContainer } from './ContentProductionConsolePage';
import { ContentProductionConsolePage } from '@/pages/admin/content-production/ContentProductionConsolePage';
import type { useContentProductionConsole } from '@/features/content-production/hooks/content-production-console/useContentProductionConsole';
/** 콘텐츠 제작 console의 독립 query 상태를 검증한다 */

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/shared/apis/auth/authenticatedRequest')
  >()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

const handlers = {
  onFile: vi.fn(),
  onSubmit: vi.fn(),
  onRetryJobs: vi.fn(),
  onRetryPresets: vi.fn(),
};
const vocabularyPreset = {
  id: '00000000-0000-4000-8000-000000000010',
  name: '어휘 추출',
  version: 1,
  purpose: 'VOCABULARY_EXTRACTION' as const,
  parameters: { suspectedDuplicateMaxCodePointDistance: 1 },
};

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('콘텐츠 제작 console 화면', () => {
  it('preset 실패와 빈 job 상태를 서로 독립적으로 표시한다', () => {
    render(
      <ContentProductionConsolePageView
        {...handlers}
        createError={false}
        jobs={{ items: [] }}
        jobsError={false}
        jobsLoading={false}
        presetsError
        presetsLoading={false}
        mutationPending={false}
      />,
    );
    expect(screen.getByText('Preset을 불러오지 못했습니다.')).toBeVisible();
    expect(screen.getByText('아직 작업이 없습니다.')).toBeVisible();
  });

  it('mutation 오류를 표시하고 진행 중에는 추가 실행을 막는다', () => {
    render(
      <ContentProductionConsolePageView
        {...handlers}
        createError
        jobs={{ items: [] }}
        jobsError={false}
        jobsLoading={false}
        mutationPending
        presets={{
          items: [vocabularyPreset],
        }}
        presetsError={false}
        presetsLoading={false}
      />,
    );
    expect(
      screen.getByText('콘텐츠 제작 작업을 만들지 못했습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '작업 실행' })).toBeDisabled();
  });
});

describe('콘텐츠 제작 console 생성 행동', () => {
  it('upload 검증 뒤 생성 중 중복 실행을 막고 실패를 안내한다', async () => {
    let rejectCreate: ((error: Error) => void) | undefined;
    const createResult = new Promise((_resolve, reject) => {
      rejectCreate = reject;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (path === '/admin/content-production/presets') {
          return Promise.resolve({ items: [vocabularyPreset] });
        }
        if (path === '/admin/content-production/jobs?limit=20') {
          return Promise.resolve({ items: [] });
        }
        if (path === '/admin/content-production/uploads/policies') {
          return Promise.resolve({
            uploadId: '00000000-0000-4000-8000-000000000020',
            url: 'https://uploads.example.test',
            fields: { key: 'private/input' },
            expiresAt: '2026-07-28T01:00:00.000Z',
          });
        }
        if (
          path ===
          '/admin/content-production/uploads/00000000-0000-4000-8000-000000000020/complete'
        ) {
          return Promise.resolve({
            uploadId: '00000000-0000-4000-8000-000000000020',
            inputType: 'TEXT',
            sizeBytes: 3,
            status: 'VERIFIED',
          });
        }
        if (path === '/admin/content-production/jobs') return createResult;
        throw new Error(`UNEXPECTED_REQUEST:${path}`);
      },
    );
    renderWithProviders(<ContentProductionConsolePageContainer />);
    const submit = await screen.findByRole('button', { name: '작업 실행' });
    fireEvent.change(screen.getByLabelText('입력 파일'), {
      target: {
        files: [new File(['abc'], 'input.txt', { type: 'text/plain' })],
      },
    });
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    rejectCreate?.(new Error('create failed'));

    expect(
      await screen.findByText('콘텐츠 제작 작업을 만들지 못했습니다.'),
    ).toBeVisible();
    const createRequests = mocks.authenticatedRequest.mock.calls.filter(
      (call) => {
        const request: unknown = call[0];
        return (
          typeof request === 'object' &&
          request !== null &&
          'path' in request &&
          request.path === '/admin/content-production/jobs'
        );
      },
    );
    expect(createRequests).toHaveLength(1);
  });
});

const pageState = vi.hoisted(() => ({
  read: vi.fn<
    () => ReturnType<typeof useContentProductionConsole> | undefined
  >(),
}));
vi.mock(
  '@/features/content-production/hooks/content-production-console/useContentProductionConsole',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/content-production/hooks/content-production-console/useContentProductionConsole')
      >();
    return {
      ...actual,
      useContentProductionConsole: (
        ...args: Parameters<typeof useContentProductionConsole>
      ) => pageState.read() ?? actual.useContentProductionConsole(...args),
    };
  },
);
beforeEach(() => {
  pageState.read.mockReset();
});
function ContentProductionConsolePageView(
  props: ReturnType<typeof useContentProductionConsole>,
) {
  pageState.read.mockReturnValue(props);
  return <ContentProductionConsolePage />;
}
