/** 콘텐츠 제작 console의 독립 query 상태를 검증한다 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { ContentProductionConsolePageContainer } from './ContentProductionConsolePageContainer';
import { ContentProductionConsolePageView } from './ContentProductionConsolePageView';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  authenticatedRequest: mocks.authenticatedRequest,
}));

const handlers = {
  onConfigurationChange: vi.fn(),
  onFile: vi.fn(),
  onPreview: vi.fn(),
  onSubmit: vi.fn(),
  onRetryJobs: vi.fn(),
  onRetryPresets: vi.fn(),
};
const questionPreset = {
  id: '00000000-0000-4000-8000-000000000010',
  name: '문제 생성',
  version: 1,
  purpose: 'QUESTION_GENERATION' as const,
  parameters: {
    questionCount: 1,
    questionTypePlan: [
      {
        questionTypeVersionId: '00000000-0000-4000-8000-000000000011',
        count: 1,
      },
    ],
    difficultyPlan: [{ difficulty: 2 as const, count: 1 }],
    targetVocabularyIds: [],
    requiredVocabularyIds: [],
    excludedVocabularyIds: [],
    newAuxiliaryVocabularyLimit: 3,
    similarityThreshold: 0.7,
    defaultVoicePresetId: '00000000-0000-4000-8000-000000000012',
    speakerVoiceAssignments: [],
    additionalInstructionKo: null,
    commonPrinciples: [],
    similarQuestions: [],
  },
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
        previewError={false}
      />,
    );
    expect(screen.getByText('Preset을 불러오지 못했습니다.')).toBeVisible();
    expect(screen.getByText('아직 작업이 없습니다.')).toBeVisible();
  });

  it('빠른 설정과 고급 설정 탭을 제공한다', () => {
    render(
      <ContentProductionConsolePageView
        {...handlers}
        createError={false}
        jobs={{ items: [] }}
        jobsError={false}
        jobsLoading={false}
        presets={{ items: [] }}
        presetsError={false}
        presetsLoading={false}
        mutationPending={false}
        previewError={false}
      />,
    );
    expect(screen.getByRole('tab', { name: '빠른 설정' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '고급 설정' })).toBeVisible();
  });

  it('mutation 오류를 표시하고 진행 중에는 preview와 실행을 함께 막는다', () => {
    render(
      <ContentProductionConsolePageView
        {...handlers}
        createError
        jobs={{ items: [] }}
        jobsError={false}
        jobsLoading={false}
        mutationPending
        presets={{
          items: [questionPreset],
        }}
        presetsError={false}
        presetsLoading={false}
        previewError
      />,
    );
    expect(
      screen.getByText('Prompt 미리보기를 만들지 못했습니다.'),
    ).toBeVisible();
    expect(
      screen.getByText('콘텐츠 제작 작업을 만들지 못했습니다.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Prompt 미리보기' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '작업 실행' })).toBeDisabled();
  });
});

describe('콘텐츠 제작 console 서버 행동', () => {
  it('요청 중 option이 바뀌면 이전 성공을 버리고 새 prompt만 표시한다', async () => {
    const stalePreview = createDeferred<ReturnType<typeof previewResult>>();
    const currentPreview = createDeferred<ReturnType<typeof previewResult>>();
    const previewRequests: Array<{ body?: unknown }> = [];
    mocks.authenticatedRequest.mockImplementation(
      (request: { body?: unknown; path: string }) => {
        const { path } = request;
        if (path === '/admin/content-production/presets') {
          return Promise.resolve({ items: [questionPreset] });
        }
        if (path === '/admin/content-production/jobs?limit=20') {
          return Promise.resolve({ items: [] });
        }
        if (path === '/admin/content-production/prompt-previews') {
          previewRequests.push(request);
          return previewRequests.length === 1
            ? stalePreview.promise
            : currentPreview.promise;
        }
        throw new Error(`UNEXPECTED_REQUEST:${path}`);
      },
    );
    const user = userEvent.setup();
    renderWithProviders(<ContentProductionConsolePageContainer />);

    await user.click(
      await screen.findByRole('button', { name: 'Prompt 미리보기' }),
    );
    await user.click(screen.getByRole('tab', { name: '고급 설정' }));
    fireEvent.change(screen.getByLabelText('신규 보조 어휘 한도'), {
      target: { value: '5' },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Prompt 미리보기' }),
      ).toBeEnabled(),
    );

    await act(async () => {
      stalePreview.resolve(previewResult('이전 option prompt'));
      await stalePreview.promise;
    });
    expect(
      screen.queryByDisplayValue('이전 option prompt'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Prompt 미리보기' }));
    await act(async () => {
      currentPreview.resolve(previewResult('현재 option prompt'));
      await currentPreview.promise;
    });
    expect(await screen.findByDisplayValue('현재 option prompt')).toBeVisible();
    expect(previewRequests).toHaveLength(2);
    expect(previewRequests[0]?.body).toMatchObject({
      options: { newAuxiliaryVocabularyLimit: 3 },
    });
    expect(previewRequests[1]?.body).toMatchObject({
      options: { newAuxiliaryVocabularyLimit: 5 },
    });
  });

  it('요청 중 option이 바뀌면 이전 실패 경고도 버린다', async () => {
    const stalePreview = createDeferred<ReturnType<typeof previewResult>>();
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (path === '/admin/content-production/presets') {
          return Promise.resolve({ items: [questionPreset] });
        }
        if (path === '/admin/content-production/jobs?limit=20') {
          return Promise.resolve({ items: [] });
        }
        if (path === '/admin/content-production/prompt-previews') {
          return stalePreview.promise;
        }
        throw new Error(`UNEXPECTED_REQUEST:${path}`);
      },
    );
    const user = userEvent.setup();
    renderWithProviders(<ContentProductionConsolePageContainer />);

    await user.click(
      await screen.findByRole('button', { name: 'Prompt 미리보기' }),
    );
    await user.click(screen.getByRole('tab', { name: '고급 설정' }));
    fireEvent.change(screen.getByLabelText('신규 보조 어휘 한도'), {
      target: { value: '5' },
    });

    await act(async () => {
      stalePreview.reject(new Error('stale preview failed'));
      await stalePreview.promise.catch(() => undefined);
    });

    expect(screen.queryByLabelText('생성 prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Prompt 미리보기를 만들지 못했습니다.'),
    ).not.toBeInTheDocument();
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
          return Promise.resolve({ items: [questionPreset] });
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

function previewResult(prompt: string) {
  return {
    promptVersion: 'v1',
    questionPlanIndex: 0,
    sections: [],
    prompt,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}
