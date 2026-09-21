/** 학습자 홈의 단일 추천 요청·개인화·fallback·오류 상태를 검증한다 */
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LearnerHomePage as LearnerHomePageContainer } from './LearnerHomePage';

const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
}));

vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const fallback = {
  mode: 'FALLBACK',
  meaningfulSignalCount: 2,
  activationThreshold: 5,
  publishedToday: { vocabularies: [] },
  newContent: { vocabularies: [] },
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
      publishedToday: {
        vocabularies: [
          {
            id: '01933b6a-8f13-7a19-b7e5-536d70f57ab0',
            thai: 'วันนี้',
            kind: 'WORD',
            publishedAt: '2026-07-31T02:00:00.000Z',
          },
        ],
      },
      newContent: {
        vocabularies: [],
      },
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
    expect(await screen.findByText('สวัสดี')).toHaveAttribute('lang', 'th');
    expect(screen.getByText('내 단어장에 담긴 어휘예요.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '오늘 게시 콘텐츠' }),
    ).toBeInTheDocument();
    expect(screen.getByText('วันนี้')).toHaveAttribute('lang', 'th');
    expect(
      screen.getByRole('heading', { name: 'NEW 콘텐츠' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '공용 사전' })).toHaveAttribute(
      'href',
      '/vocabularies',
    );
    expect(screen.getByRole('link', { name: '내 단어장' })).toHaveAttribute(
      'href',
      '/wordbooks',
    );
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/me/recommendations' }),
    );
  });

  it('활성화 전에는 신호 수와 최근 게시 fallback을 안내한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      ...fallback,
      vocabularies: [],
    });

    renderLearnerHome();

    expect(
      await screen.findByText('개인 추천을 준비하고 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/학습 신호 2개.*5개/u)).toBeInTheDocument();
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
