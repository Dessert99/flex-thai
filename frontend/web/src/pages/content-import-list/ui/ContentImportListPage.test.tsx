/** canonical JSON 가져오기의 사전 검증과 멱등 제출 경계를 검증한다 */
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { ContentImportListPageContainer } from './ContentImportListPageContainer';

interface CapturedRequest {
  headers?: Record<string, string>;
  method?: string;
}

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn<(request: CapturedRequest) => Promise<unknown>>(),
  randomUUID: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.authenticatedRequest
    .mockReset()
    .mockImplementation(({ method }: { method?: string }) =>
      Promise.resolve(
        method === 'POST'
          ? createImportDetail()
          : {
              items: [],
              page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
            },
      ),
    );
  vi.spyOn(crypto, 'randomUUID').mockImplementation(mocks.randomUUID);
  mocks.randomUUID
    .mockReset()
    .mockReturnValueOnce('01933b6a-8f13-7a19-b7e5-536d70f57ac1')
    .mockReturnValueOnce('01933b6a-8f13-7a19-b7e5-536d70f57ac2');
});

describe('콘텐츠 가져오기 페이지', () => {
  it('잘못된 JSON과 계약 field path를 서버 전송 전에 표시한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentImportListPageContainer />);

    fireEvent.change(screen.getByLabelText('canonical JSON'), {
      target: { value: '{invalid' },
    });
    await user.click(screen.getByRole('button', { name: '가져오기' }));

    expect(screen.getByText('JSON 구문을 확인해 주세요.')).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('canonical JSON'), {
      target: {
        value: JSON.stringify({
          schemaVersion: 1,
          vocabularies: [],
          questions: [],
        }),
      },
    });
    await user.click(screen.getByRole('button', { name: '가져오기' }));

    expect(
      screen.getByText(/가져오기 항목 합계는 1개에서 100개/u),
    ).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(1);
  });
});

describe('콘텐츠 가져오기 멱등 제출', () => {
  it('실패 재전송에는 같은 Idempotency-Key를 사용한다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) => {
        if (method === 'POST') {
          return Promise.reject(new Error('network'));
        }
        return Promise.resolve({
          items: [],
          page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        });
      },
    );
    const user = userEvent.setup();
    renderWithProviders(<ContentImportListPageContainer />);
    const valid = JSON.stringify(createValidRequest());

    fireEvent.change(screen.getByLabelText('canonical JSON'), {
      target: { value: valid },
    });
    await user.click(screen.getByRole('button', { name: '가져오기' }));
    await user.click(
      await screen.findByRole('button', { name: '같은 요청 다시 보내기' }),
    );

    const posts = getPostRequests();
    expect(posts[0]?.headers?.['Idempotency-Key']).toBe(
      posts[1]?.headers?.['Idempotency-Key'],
    );
    expect(mocks.randomUUID).toHaveBeenCalledOnce();
  });
});

describe('콘텐츠 가져오기 계약 한계', () => {
  it('가져오기 항목이 100개를 넘으면 서버로 전송하지 않는다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentImportListPageContainer />);
    const request = createValidRequest();
    const vocabularies = Array.from({ length: 101 }, (_, index) => ({
      ...request.vocabularies[0],
      clientRef: `vocabulary-${index}`,
    }));

    fireEvent.change(screen.getByLabelText('canonical JSON'), {
      target: { value: JSON.stringify({ ...request, vocabularies }) },
    });
    await user.click(screen.getByRole('button', { name: '가져오기' }));

    expect(
      screen.getByText(/가져오기 항목 합계는 1개에서 100개/u),
    ).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(1);
  });
});

describe('콘텐츠 가져오기 복구 안내', () => {
  it('성공한 뒤 새 제출에는 새 Idempotency-Key를 사용한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentImportListPageContainer />);
    const input = screen.getByLabelText('canonical JSON');

    fireEvent.change(input, {
      target: { value: JSON.stringify(createValidRequest()) },
    });
    await user.click(screen.getByRole('button', { name: '가져오기' }));
    await screen.findByText('콘텐츠 가져오기가 완료되었습니다.');

    fireEvent.change(input, {
      target: {
        value: JSON.stringify({
          ...createValidRequest(),
          vocabularies: [
            {
              ...createValidRequest().vocabularies[0],
              clientRef: 'vocabulary-2',
            },
          ],
        }),
      },
    });
    await user.click(screen.getByRole('button', { name: '가져오기' }));

    const posts = getPostRequests();
    expect(posts[0]?.headers?.['Idempotency-Key']).not.toBe(
      posts[1]?.headers?.['Idempotency-Key'],
    );
    expect(mocks.randomUUID).toHaveBeenCalledTimes(2);
  });

  it.each([
    [413, '파일 크기를 줄여 다시 시도해 주세요.'],
    [429, '잠시 기다린 뒤 같은 요청을 다시 보내 주세요.'],
  ])('%i 응답에는 안전한 복구 안내를 표시한다', async (status, message) => {
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) =>
        method === 'POST'
          ? Promise.reject(createProblemError(status))
          : Promise.resolve({
              items: [],
              page: {
                page: 1,
                pageSize: 20,
                totalItems: 0,
                totalPages: 0,
              },
            }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ContentImportListPageContainer />);

    fireEvent.change(screen.getByLabelText('canonical JSON'), {
      target: { value: JSON.stringify(createValidRequest()) },
    });
    await user.click(screen.getByRole('button', { name: '가져오기' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});

function getPostRequests() {
  return mocks.authenticatedRequest.mock.calls
    .map(([request]) => request)
    .filter(({ method }) => method === 'POST');
}

function createValidRequest() {
  return {
    schemaVersion: 1,
    vocabularies: [
      {
        clientRef: 'vocabulary-1',
        thai: 'สวัสดี',
        kind: 'WORD',
        meanings: [
          {
            clientRef: 'meaning-1',
            meaningKo: '안녕하세요',
            partOfSpeech: '감탄사',
          },
        ],
        pronunciations: [
          {
            clientRef: 'pronunciation-1',
            pronunciationKo: '싸왓디',
            toneMarks: '',
            mediaAssetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
          },
        ],
      },
    ],
    questions: [],
  };
}

function createImportDetail() {
  return {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57abb',
    status: 'COMPLETED',
    vocabularyCount: 1,
    questionCount: 0,
    importedCount: 1,
    rejectedCount: 0,
    createdAt: '2026-07-25T00:00:00.000Z',
    completedAt: '2026-07-25T00:00:01.000Z',
    items: [
      {
        kind: 'VOCABULARY',
        sourceIndex: 0,
        status: 'IMPORTED',
        targetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
        errors: [],
      },
    ],
  };
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '요청을 처리하지 못했습니다.',
      status,
      code: `HTTP_${status}`,
      requestId: 'request-123',
      fieldErrors: [],
    },
  });
}
