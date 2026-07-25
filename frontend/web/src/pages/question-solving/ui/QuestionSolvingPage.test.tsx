/** 문제 상세의 대본 공개와 가용성 충돌 복구 상태를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { QuestionSolvingPageContainer } from './QuestionSolvingPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('문제 풀이 페이지', () => {
  it('AUDIO_THEN_REVEAL 대본을 사용자 요청 전에는 숨긴다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createQuestion());
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionSolvingPageContainer questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa' />,
    );

    expect(await screen.findByText('듣기 문제')).toBeInTheDocument();
    expect(screen.queryByText('สวัสดีครับ')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '대본 보기' }));
    expect(screen.getByText('สวัสดีครับ')).toHaveAttribute('lang', 'th');
  });

  it('QUESTION_UNAVAILABLE 충돌에서 문제 목록 복구 경로를 제공한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(
      new ApiError({
        kind: 'problem',
        problem: {
          type: 'https://flex-thia.dev/problems/question',
          title: 'Unavailable',
          status: 409,
          code: 'QUESTION_UNAVAILABLE',
          requestId: 'request-question',
          fieldErrors: [],
        },
      }),
    );

    renderWithProviders(
      <QuestionSolvingPageContainer questionId='01933b6a-8f13-7a19-b7e5-536d70f57aaa' />,
    );

    expect(
      await screen.findByRole('heading', {
        name: '이 문제는 지금 풀 수 없습니다.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '문제 목록으로' })).toHaveAttribute(
      'href',
      '/questions',
    );
  });
});

function createQuestion() {
  const sentence = {
    sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
    originalText: 'สวัสดีครับ',
    translationKo: '안녕하세요',
    pronunciationKo: '싸왓디 크랍',
    toneMarks: '',
    audioUrl: 'https://example.com/audio.mp3',
    tokens: [],
    expressions: [],
  };
  return {
    questionId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57aab',
    questionType: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
      slug: 'listening',
      displayName: '듣기 문제',
    },
    skill: 'LISTENING',
    difficulty: 2,
    template: 'STANDARD_CHOICE',
    blocks: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ad1',
        kind: 'QUESTION',
        displayMode: 'AUDIO_THEN_REVEAL',
        position: 0,
        sentences: [{ position: 0, speaker: null, sentence }],
      },
    ],
    options: [],
    saved: false,
  };
}
