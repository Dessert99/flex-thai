/** 관리자 개념 목록 Container의 검색 병합과 생성 mutation을 검증한다 */
/* eslint-disable max-lines-per-function */
import { conceptVersionResponseSchema } from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { ConceptManagementPageContainer } from './ConceptManagementPageContainer';

interface CapturedRequest {
  method?: string;
  path: string;
}

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn<(request: CapturedRequest) => Promise<unknown>>(),
}));

vi.mock('@/shared/api', () => ({
  authenticatedRequest: mocks.authenticatedRequest,
}));

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue(createEmptyPage());
});

describe('ConceptManagementPageContainer', () => {
  it('필터 변경 patch를 현재 URL search와 병합한다', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderWithProviders(
      <ConceptManagementPageContainer
        onSearchChange={onSearchChange}
        search={{
          category: 'GRAMMAR',
          page: 2,
          pageSize: 20,
        }}
      />,
    );
    await screen.findByRole('heading', { name: '등록된 개념이 없습니다.' });

    await user.selectOptions(screen.getByLabelText('공개 상태'), 'HIDDEN');

    expect(onSearchChange).toHaveBeenCalledWith({
      category: 'GRAMMAR',
      status: 'HIDDEN',
      page: 1,
      pageSize: 20,
    });
  });

  it('새 개념을 생성한 뒤 관리자 개념 cache를 다시 조회한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) =>
        Promise.resolve(
          method === 'POST'
            ? {
                id: '22222222-2222-4222-8222-222222222222',
                conceptId: '11111111-1111-4111-8111-111111111111',
              }
            : createEmptyPage(),
        ),
    );
    renderManagement();
    await screen.findByRole('heading', { name: '등록된 개념이 없습니다.' });

    await user.type(screen.getByLabelText('새 개념 제목'), '수량 표현');
    await user.type(screen.getByLabelText('새 개념 요약'), '태국어 수량 표현');
    await user.clear(screen.getByLabelText('새 개념 교육 순서'));
    await user.type(screen.getByLabelText('새 개념 교육 순서'), '3');
    await user.type(
      screen.getByLabelText('첫 설명 문단'),
      '명사 뒤에 수량사를 둡니다.',
    );
    await user.click(screen.getByRole('button', { name: '개념 만들기' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith({
      body: {
        category: 'GRAMMAR',
        position: 3,
        title: '수량 표현',
        summary: '태국어 수량 표현',
        blocks: [
          {
            kind: 'EXPLANATION',
            position: 0,
            heading: '설명',
            paragraphs: ['명사 뒤에 수량사를 둡니다.'],
          },
        ],
      },
      method: 'POST',
      path: '/admin/concepts',
      response: { kind: 'json', schema: conceptVersionResponseSchema },
    });
    await vi.waitFor(() =>
      expect(
        mocks.authenticatedRequest.mock.calls.filter(
          ([request]) => request.method !== 'POST',
        ),
      ).toHaveLength(2),
    );
  });

  it.each([
    {
      error: new Error('생성 권한이 없습니다.'),
      message: '생성 권한이 없습니다.',
      name: 'Error 메시지',
    },
    {
      error: 'unexpected',
      message: '개념을 만들지 못했습니다.',
      name: '알 수 없는 실패',
    },
  ])('$name를 생성 실패 안내로 표시한다', async ({ error, message }) => {
    const user = userEvent.setup();
    mocks.authenticatedRequest.mockImplementation(
      ({ method }: { method?: string }) => {
        if (method === 'POST') {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(error);
        }
        return Promise.resolve(createEmptyPage());
      },
    );
    renderManagement();
    await screen.findByRole('heading', { name: '등록된 개념이 없습니다.' });

    await user.type(screen.getByLabelText('새 개념 제목'), '문법');
    await user.type(screen.getByLabelText('새 개념 요약'), '요약');
    await user.type(screen.getByLabelText('첫 설명 문단'), '본문');
    await user.click(screen.getByRole('button', { name: '개념 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});

function renderManagement() {
  return renderWithProviders(
    <ConceptManagementPageContainer
      onSearchChange={vi.fn()}
      search={{ page: 1, pageSize: 20 }}
    />,
  );
}

function createEmptyPage() {
  return {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  };
}
