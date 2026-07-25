/** 관리자 문제 상세의 404·검증 보고서·불변 버전 표현을 검증한다 */
import { screen } from '@testing-library/react';
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
  it('404 응답을 존재하지 않는 문제로 안전하게 안내한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(createProblemError(404));

    renderDetail();

    expect(
      await screen.findByText('요청한 문제를 찾을 수 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('요청 ID: request-question')).toBeInTheDocument();
  });

  it('FAILED 검증 issue의 안정 path와 code를 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestionDetail());

    renderDetail();

    expect(
      await screen.findByText('blocks.0.sentences.0 · MEDIA_ASSET_NOT_READY'),
    ).toBeInTheDocument();
  });

  it('DRAFT에만 전체 교체 링크를 제공해 게시 버전을 직접 편집하지 않는다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestionDetail());

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

function createQuestionDetail() {
  return {
    questionId,
    status: 'PUBLISHED',
    currentPublishedVersionId: publishedVersionId,
    versions: [
      createVersion({
        id: draftVersionId,
        status: 'DRAFT',
        validation: {
          status: 'FAILED',
          issues: [
            {
              path: 'blocks.0.sentences.0',
              code: 'MEDIA_ASSET_NOT_READY',
            },
          ],
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
