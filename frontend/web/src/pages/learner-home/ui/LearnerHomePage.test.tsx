/** 학습자 홈의 단일 추천 요청·개인화·fallback·오류 상태를 검증한다 */
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

const fallback = {
  mode: 'FALLBACK',
  meaningfulSignalCount: 2,
  activationThreshold: 5,
  questions: [],
  vocabularies: [],
} as const;

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mocks.authenticatedRequest.mockResolvedValue(fallback);
});

describe('학습자 홈 페이지', () => {
  it('한 요청으로 개인 추천 문제·어휘와 이유를 표시한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      mode: 'PERSONALIZED',
      meaningfulSignalCount: 5,
      activationThreshold: 5,
      questions: [
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
          reasonCode: 'FIRST_INCORRECT_RETRY',
          reason: '첫 풀이에서 틀려 다시 풀어볼 문제예요.',
        },
      ],
      vocabularies: [
        {
          id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
          thai: 'สวัสดี',
          kind: 'WORD',
          reasonCode: 'IN_WORDBOOK',
          reason: '내 단어장에 담긴 어휘예요.',
        },
      ],
    });

    renderLearnerHome();

    expect(
      await screen.findByRole('link', { name: /문맥에 맞는 표현/u }),
    ).toHaveAttribute(
      'href',
      '/questions/01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    );
    expect(screen.getByText('สวัสดี')).toHaveAttribute('lang', 'th');
    expect(
      screen.getByText('첫 풀이에서 틀려 다시 풀어볼 문제예요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('내 단어장에 담긴 어휘예요.')).toBeInTheDocument();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/me/recommendations' }),
    );
  });

  it('활성화 전에는 신호 수와 최근 게시 fallback을 안내한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      ...fallback,
      questions: [
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
          reasonCode: 'RECENTLY_PUBLISHED',
          reason: '최근 게시된 문제예요.',
        },
      ],
      vocabularies: [],
    });

    renderLearnerHome();

    expect(
      await screen.findByText('개인 추천을 준비하고 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/학습 신호 2개.*5개/u)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '최근 문제' }),
    ).toBeInTheDocument();
  });

  it('추천 요청이 실패하면 다시 시도할 수 있는 오류를 표시한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(new Error('failed'));

    renderLearnerHome();

    expect(
      await screen.findByText('추천 콘텐츠를 불러오지 못했습니다.'),
    ).toBeInTheDocument();
  });
});

function renderLearnerHome() {
  return renderWithProviders(<LearnerHomePageContainer />);
}
