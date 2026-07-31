/** 관리자 문제 상세의 404·검증 보고서·불변 버전 표현을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { AdminQuestionDetailPageContainer } from './AdminQuestionDetailPageContainer';

const questionId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const draftVersionId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';
const publishedVersionId = '01933b6a-8f13-7a19-b7e5-536d70f57aac';
const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('관리자 문제 상세 상태', () => {
  it('DRAFT마다 TTS readiness를 조회하고 blocker가 있으면 게시를 막는다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (path.includes('/readiness')) {
          return Promise.resolve({
            ready: false,
            requiredCount: 1,
            readyCount: 0,
            blockers: [
              {
                kind: 'THAI_SENTENCE_VERSION',
                targetId: '00000000-0000-4000-8000-000000000011',
                mediaStatus: 'MISSING',
                operation: null,
              },
            ],
          });
        }
        return Promise.resolve(
          createQuestionDetail({ draftValidationStatus: 'PASSED' }),
        );
      },
    );

    renderDetail();

    expect(
      await screen.findAllByText('필수 음성이 준비되지 않았습니다.'),
    ).toHaveLength(2);
    expect(screen.getByRole('button', { name: '버전 게시' })).toBeDisabled();
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/admin/tts/questions/${questionId}/versions/${draftVersionId}/readiness`,
      }),
    );
    expect(
      mocks.authenticatedRequest.mock.calls.filter(([options]) =>
        (options as { path: string }).path.includes('/readiness'),
      ),
    ).toHaveLength(1);
  });

  it('검증과 TTS readiness가 모두 통과하면 게시를 허용한다', async () => {
    mockDetailAndReadiness(
      createQuestionDetail({ draftValidationStatus: 'PASSED' }),
      createReadyReadiness(),
    );

    renderDetail();

    expect(
      await screen.findByText('필수 음성이 모두 준비되었습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '버전 게시' })).toBeEnabled();
  });

  it('TTS가 준비되어도 validation 실패 DRAFT에는 게시를 제공하지 않는다', async () => {
    mockDetailAndReadiness(createQuestionDetail(), createReadyReadiness());

    renderDetail();

    expect(
      await screen.findByText('필수 음성이 모두 준비되었습니다.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '버전 게시' }),
    ).not.toBeInTheDocument();
  });
});

describe('관리자 문제 TTS readiness 복구', () => {
  it('readiness 조회 실패를 version 안에서 다시 시도할 수 있다', async () => {
    let readinessAttempts = 0;
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (!path.includes('/readiness')) {
          return Promise.resolve(
            createQuestionDetail({ draftValidationStatus: 'PASSED' }),
          );
        }
        readinessAttempts += 1;
        return readinessAttempts === 1
          ? Promise.reject(new Error('readiness unavailable'))
          : Promise.resolve(createReadyReadiness());
      },
    );

    renderDetail();

    await userEvent.click(
      await screen.findByRole('button', { name: 'TTS 준비 상태 다시 시도' }),
    );
    expect(
      await screen.findByText('필수 음성이 모두 준비되었습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '버전 게시' })).toBeEnabled();
  });

  it('404 응답을 존재하지 않는 문제로 안전하게 안내한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(createProblemError(404));

    renderDetail();

    expect(
      await screen.findByText('요청한 문제를 찾을 수 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('요청 ID: request-question')).toBeInTheDocument();
  });

  it('FAILED 검증 issue의 안정 path와 code를 표시한다', async () => {
    mockDetailAndReadiness(createQuestionDetail(), createReadyReadiness());

    renderDetail();

    expect(
      await screen.findByText('blocks.0.sentences.0 · MEDIA_ASSET_NOT_READY'),
    ).toBeInTheDocument();
  });

  it('DRAFT에만 전체 교체 링크를 제공해 게시 버전을 직접 편집하지 않는다', async () => {
    mockDetailAndReadiness(createQuestionDetail(), createReadyReadiness());

    renderDetail();

    expect(
      await screen.findByRole('link', { name: '버전 3 전체 교체' }),
    ).toHaveAttribute(
      'href',
      `/admin/questions/${questionId}/versions/${draftVersionId}/replace`,
    );
    expect(
      screen.queryByRole('link', { name: '버전 2 전체 교체' }),
    ).not.toBeInTheDocument();
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminQuestionDetailPageContainer questionId={questionId} />,
  );
}

function mockDetailAndReadiness(
  detail: ReturnType<typeof createQuestionDetail>,
  readiness: ReturnType<typeof createReadyReadiness>,
) {
  mocks.authenticatedRequest.mockImplementation(({ path }: { path: string }) =>
    Promise.resolve(path.includes('/readiness') ? readiness : detail),
  );
}

function createReadyReadiness() {
  return {
    ready: true,
    requiredCount: 1,
    readyCount: 1,
    blockers: [],
  };
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '문제를 찾을 수 없습니다.',
      status,
      code: 'QUESTION_NOT_FOUND',
      requestId: 'request-question',
      fieldErrors: [],
    },
  });
}

function createQuestionDetail({
  draftValidationStatus = 'FAILED',
}: {
  draftValidationStatus?: 'FAILED' | 'PASSED';
} = {}) {
  return {
    questionId,
    status: 'PUBLISHED',
    currentPublishedVersionId: publishedVersionId,
    versions: [
      createVersion({
        id: draftVersionId,
        status: 'DRAFT',
        validation: {
          status: draftValidationStatus,
          issues:
            draftValidationStatus === 'FAILED'
              ? [
                  {
                    path: 'blocks.0.sentences.0',
                    code: 'MEDIA_ASSET_NOT_READY',
                  },
                ]
              : [],
          validatedAt: '2026-07-25T00:00:00.000Z',
        },
        version: 3,
      }),
      createVersion({
        id: publishedVersionId,
        status: 'PUBLISHED',
        validation: {
          status: 'PASSED',
          issues: [],
          validatedAt: '2026-07-24T00:00:00.000Z',
        },
        version: 2,
      }),
    ],
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  };
}

function createVersion({
  id,
  status,
  validation,
  version,
}: {
  id: string;
  status: 'DRAFT' | 'PUBLISHED';
  validation: {
    status: 'FAILED' | 'PASSED';
    issues: Array<{ path: string; code: string }>;
    validatedAt: string;
  };
  version: number;
}) {
  const optionId = `${id.slice(0, -1)}d`;
  return {
    id,
    version,
    status,
    validation,
    questionType: {
      id: `${id.slice(0, -1)}e`,
      slug: 'dialogue-choice',
      version: 1,
      skill: 'LISTENING',
      template: 'DIALOGUE_CHOICE',
    },
    difficulty: 4,
    blocks: [],
    options: [{ id: optionId, position: 0, sentenceVersionId: id }],
    correctOptionId: optionId,
    createdAt: '2026-07-25T00:00:00.000Z',
    publishedAt: status === 'PUBLISHED' ? '2026-07-25T00:00:00.000Z' : null,
  };
}
