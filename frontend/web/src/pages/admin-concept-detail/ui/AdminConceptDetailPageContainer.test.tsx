/** 관리자 개념 상세 Container의 초안 저장·충돌·상태 action을 검증한다 */
import {
  conceptValidationReportSchema,
  conceptVersionResponseSchema,
} from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { AdminConceptDetailPageContainer } from './AdminConceptDetailPageContainer';

interface CapturedRequest {
  method?: string;
  path: string;
}

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn<(request: CapturedRequest) => Promise<unknown>>(),
}));
const conceptId = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
const publishedId = '33333333-3333-4333-8333-333333333333';

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('AdminConceptDetailPageContainer 초안 편집', () => {
  it('서버 초안의 block ID를 제거하고 revision과 편집값을 저장한다', async () => {
    const user = userEvent.setup();
    mockDetailAndMutations(createDetailWithDraft('PENDING'));
    renderDetail();
    const title = await screen.findByLabelText('제목');
    expect(title).toHaveValue('기본 어순');

    await user.clear(title);
    await user.type(title, '고친 기본 어순');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      body: {
        revision: 2,
        category: 'GRAMMAR',
        position: 0,
        title: '고친 기본 어순',
        summary: '태국어의 기본 순서',
        blocks: [
          {
            kind: 'EXPLANATION',
            position: 0,
            heading: '설명',
            paragraphs: ['주어 뒤에 서술어를 둡니다.'],
          },
        ],
      },
      method: 'PUT',
      path: `/admin/concept-versions/${draftId}`,
      response: { kind: 'json', schema: conceptVersionResponseSchema },
    });
  });

  it('필수 제목이 비어 있으면 저장 요청 대신 입력 안내를 표시한다', async () => {
    const user = userEvent.setup();
    mockDetailAndMutations(createDetailWithDraft('PENDING'));
    renderDetail();
    const title = await screen.findByLabelText('제목');

    await user.clear(title);
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '입력값을 확인해 주세요.',
    );
    expect(
      mocks.authenticatedRequest.mock.calls.some(
        ([request]) => request.method === 'PUT',
      ),
    ).toBe(false);
  });

  it('검증과 PASSED 초안 게시 action을 각각 실행한다', async () => {
    const user = userEvent.setup();
    mockDetailAndMutations(createDetailWithDraft('PASSED'));
    renderDetail();
    await screen.findByLabelText('제목');

    await user.click(screen.getByRole('button', { name: '검증' }));
    await vi.waitFor(() =>
      expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
        method: 'POST',
        path: `/admin/concept-versions/${draftId}/validate`,
        response: {
          kind: 'json',
          schema: conceptValidationReportSchema,
        },
      }),
    );
    await user.click(screen.getByRole('button', { name: '게시' }));
    await vi.waitFor(() =>
      expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
        method: 'POST',
        path: `/admin/concept-versions/${draftId}/publish`,
        response: { kind: 'empty' },
      }),
    );
  });
});

describe('AdminConceptDetailPageContainer 충돌 처리', () => {
  it('409 저장 충돌을 안내하고 최신 관리자 개념 cache를 다시 읽는다', async () => {
    const user = userEvent.setup();
    let detailReads = 0;
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) => {
        if (method === 'PUT') return Promise.reject(createProblemError(409));
        detailReads += 1;
        return Promise.resolve(createDetailWithDraft('PENDING'));
      },
    );
    renderDetail();
    await screen.findByLabelText('제목');

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '다른 관리자가 수정했습니다.',
    );
    await vi.waitFor(() => expect(detailReads).toBeGreaterThanOrEqual(2));
  });

  it('409가 아닌 mutation 실패는 재시도 안내를 표시한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) =>
        method === 'POST'
          ? Promise.reject(createProblemError(500))
          : Promise.resolve(createDetailWithDraft('PENDING')),
    );
    renderDetail();
    await screen.findByLabelText('제목');

    await user.click(screen.getByRole('button', { name: '검증' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '요청을 처리하지 못했습니다. 다시 시도해 주세요.',
    );
  });
});

describe('AdminConceptDetailPageContainer 공개 상태', () => {
  it('초안이 없는 게시 개념에서 다음 초안을 만든다', async () => {
    const user = userEvent.setup();
    mockDetailAndMutations(createPublishedDetail('PUBLISHED'));
    renderDetail();
    await screen.findByText('상태: PUBLISHED');

    await user.click(screen.getByRole('button', { name: '새 초안 만들기' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: `/admin/concepts/${conceptId}/versions`,
      response: { kind: 'json', schema: conceptVersionResponseSchema },
    });
  });

  it.each([
    {
      action: 'hide',
      button: '숨기기',
      status: 'PUBLISHED' as const,
    },
    {
      action: 'restore',
      button: '복구',
      status: 'HIDDEN' as const,
    },
  ])(
    '$status 개념의 $button action을 전송한다',
    async ({ action, button, status }) => {
      const user = userEvent.setup();
      mockDetailAndMutations(createPublishedDetail(status));
      renderDetail();
      await screen.findByText(`상태: ${status}`);

      await user.click(screen.getByRole('button', { name: button }));

      expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
        method: 'POST',
        path: `/admin/concepts/${conceptId}/${action}`,
        response: { kind: 'empty' },
      });
    },
  );

  it('상세 query 실패 뒤 사용자가 다시 시도하면 개념을 표시한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(createPublishedDetail('PUBLISHED'));
    renderDetail();

    await user.click(await screen.findByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('상태: PUBLISHED')).toBeInTheDocument();
  });
});

function renderDetail() {
  return renderWithProviders(
    <AdminConceptDetailPageContainer conceptId={conceptId} />,
  );
}

function mockDetailAndMutations(detail: unknown) {
  mocks.authenticatedRequest.mockImplementation(
    ({ method }: { method?: string }) =>
      Promise.resolve(method ? undefined : detail),
  );
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '개념 요청 실패',
      status,
      code: status === 409 ? 'CONCEPT_REVISION_CONFLICT' : 'INTERNAL_ERROR',
      requestId: 'request-concept',
      fieldErrors: [],
    },
  });
}

function createDetailWithDraft(validationStatus: 'PENDING' | 'PASSED') {
  return {
    id: conceptId,
    status: 'DRAFT' as const,
    currentPublishedVersionId: null,
    versions: [
      {
        id: draftId,
        conceptId,
        version: 1,
        revision: 2,
        category: 'GRAMMAR' as const,
        position: 0,
        title: '기본 어순',
        summary: '태국어의 기본 순서',
        status: 'DRAFT' as const,
        validationStatus,
        validationIssues: [],
        validatedAt:
          validationStatus === 'PASSED' ? '2026-07-26T00:00:00.000Z' : null,
        publishedAt: null,
        blocks: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            kind: 'EXPLANATION' as const,
            position: 0,
            heading: '설명',
            paragraphs: ['주어 뒤에 서술어를 둡니다.'],
          },
        ],
      },
    ],
  };
}

function createPublishedDetail(status: 'PUBLISHED' | 'HIDDEN') {
  return {
    id: conceptId,
    status,
    currentPublishedVersionId: publishedId,
    versions: [
      {
        id: publishedId,
        conceptId,
        version: 1,
        revision: 0,
        category: 'GRAMMAR' as const,
        position: 0,
        title: '기본 어순',
        summary: '태국어의 기본 순서',
        status: 'PUBLISHED' as const,
        validationStatus: 'PASSED' as const,
        validationIssues: [],
        validatedAt: '2026-07-26T00:00:00.000Z',
        publishedAt: '2026-07-26T00:00:00.000Z',
        blocks: [],
      },
    ],
  };
}
