/** 학습자 홈의 최근 콘텐츠·부분 실패·빈 상태·내비게이션 경계를 검증한다 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { LearnerHomePageContainer } from './LearnerHomePageContainer';

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const page = {
  page: 1,
  pageSize: 3,
  totalItems: 1,
  totalPages: 1,
};

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mockHomeResponses(
    { items: [], page: { ...page, totalItems: 0, totalPages: 0 } },
    { items: [], page: { ...page, totalItems: 0, totalPages: 0 } },
  );
});

describe('학습자 홈 페이지', () => {
  it('최근 문제와 태국어 어휘를 표시하고 통계를 만들지 않는다', async () => {
    mockHomeResponses(
      {
        items: [
          {
            questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
            questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
            questionType: {
              id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
              slug: 'reading-context',
              displayName: '문맥에 맞는 표현',
            },
            skill: 'READING',
            difficulty: 2,
            saved: false,
            firstResult: 'UNANSWERED',
          },
        ],
        page,
      },
      {
        items: [
          {
            id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
            thai: 'สวัสดี',
            kind: 'WORD',
            meanings: [],
            pronunciations: [],
            saved: false,
          },
        ],
        page,
      },
    );

    renderLearnerHome();

    expect(
      await screen.findByRole('link', { name: /문맥에 맞는 표현/u }),
    ).toHaveAttribute(
      'href',
      '/questions/01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    );
    expect(screen.getByText('สวัสดี')).toHaveAttribute('lang', 'th');
    expect(
      screen.queryByText(/정답률|연속 학습|추천/u),
    ).not.toBeInTheDocument();
  });

  it('최근 문제 요청이 실패해도 최근 어휘는 유지한다', async () => {
    mockHomeResponses(new Error('question failed'), {
      items: [
        {
          id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
          thai: 'ขอบคุณ',
          kind: 'WORD',
          meanings: [],
          pronunciations: [],
          saved: false,
        },
      ],
      page,
    });

    renderLearnerHome();

    expect(await screen.findByText('ขอบคุณ')).toBeInTheDocument();
    expect(
      screen.getByText('최근 문제를 불러오지 못했습니다.'),
    ).toBeInTheDocument();
  });

  it('두 최근 목록이 모두 비면 학습 시작 경로를 안내한다', async () => {
    renderLearnerHome();

    expect(
      await screen.findByRole('heading', {
        name: '아직 표시할 학습 콘텐츠가 없습니다.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '문제 둘러보기' })).toHaveAttribute(
      'href',
      '/questions',
    );
  });
});

function renderLearnerHome() {
  return renderWithProviders(<LearnerHomePageContainer />);
}

function mockHomeResponses(
  questionResponse: unknown,
  vocabularyResponse: unknown,
) {
  mocks.authenticatedRequest.mockImplementation(
    ({ path }: { path: string }) => {
      const response = path.startsWith('/questions')
        ? questionResponse
        : vocabularyResponse;
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response);
    },
  );
}
