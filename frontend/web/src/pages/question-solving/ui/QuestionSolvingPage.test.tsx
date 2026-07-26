/** 문제 상세의 대본 공개와 가용성 충돌 복구 상태를 검증한다 */
import type { QuestionDetailResponse } from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import { QuestionSolvingPageContainer } from './QuestionSolvingPageContainer';
import { QuestionSolvingPageView } from './QuestionSolvingPageView';

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
    expect(screen.getAllByText('สวัสดีครับ')).toHaveLength(2);
  });

  it('화자별 대화와 문장 번호 주석을 렌더링한다', () => {
    renderWithProviders(
      <QuestionSolvingPageView
        detail={createDialogueQuestion()}
        onSavedConfirmed={vi.fn()}
      />,
    );

    expect(screen.getByText('A')).toBeVisible();
    expect(screen.getByText('B')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '1번 문장 뜻과 발음 듣기' }),
    ).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: '문장별 주석' }),
    ).toBeVisible();
  });

  it('좁은 화면용 문장별 주석 Sheet에서 같은 문장을 제공한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionSolvingPageView
        detail={createDialogueQuestion()}
        onSavedConfirmed={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: '문장별 주석 열기' }),
    );

    expect(
      screen.getAllByRole('button', { name: '1번 문장 뜻과 발음 듣기' }),
    ).toHaveLength(1);
  });

  it('듣기 대본은 제출 전 숨기고 제출 직후 자동 공개한다', async () => {
    const detail = createQuestion();
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        Promise.resolve(
          path.endsWith('/attempts') ? createFeedback() : detail,
        ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionSolvingPageContainer questionId={detail.questionId} />,
    );

    expect(await screen.findByText('듣기 문제')).toBeVisible();
    expect(screen.queryByText('สวัสดีครับ')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'คำตอบ' }));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));

    expect(await screen.findAllByText('สวัสดีครับ')).toHaveLength(2);
  });

  it('제출 뒤 선택지와 상호작용 해설을 유지한다', async () => {
    const detail = createQuestionWithInteractiveExplanation();
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        Promise.resolve(
          path.endsWith('/attempts')
            ? createInteractiveFeedback(detail)
            : detail,
        ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionSolvingPageContainer questionId={detail.questionId} />,
    );

    await user.click(await screen.findByRole('radio', { name: 'คำตอบ' }));
    await user.click(screen.getByRole('button', { name: '답안 제출' }));

    expect(
      await screen.findByRole('radio', { name: /선택한 답/ }),
    ).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'เพราะ 뜻과 발음 듣기' }),
    ).toBeVisible();
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

function createQuestion(): QuestionDetailResponse {
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
    options: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57ae1',
        position: 0,
        sentence: { ...sentence, originalText: 'คำตอบ' },
      },
    ],
    saved: false,
  };
}

function createDialogueQuestion(): QuestionDetailResponse {
  const detail = createQuestion();
  const firstSentence = detail.blocks[0]!.sentences[0]!.sentence;
  return {
    ...detail,
    template: 'DIALOGUE_CHOICE' as const,
    blocks: [
      {
        ...detail.blocks[0]!,
        kind: 'DIALOGUE' as const,
        displayMode: 'TEXT_AND_AUDIO' as const,
        sentences: [
          { position: 1, speaker: 'B', sentence: firstSentence },
          {
            position: 0,
            speaker: 'A',
            sentence: {
              ...firstSentence,
              sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57af1',
            },
          },
        ],
      },
    ],
  };
}

function createFeedback() {
  return {
    attempt: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57af2',
      attemptNo: 1,
      isFirst: true,
      isCorrect: true,
      selectedOptionId: '01933b6a-8f13-7a19-b7e5-536d70f57ae1',
      submittedAt: '2026-07-26T00:00:00.000Z',
    },
    feedback: {
      correctOptionId: '01933b6a-8f13-7a19-b7e5-536d70f57ae1',
      explanationBlocks: [],
    },
  };
}

function createQuestionWithInteractiveExplanation(): QuestionDetailResponse {
  return createQuestion();
}

function createInteractiveFeedback(detail: QuestionDetailResponse) {
  const base = createFeedback();
  const sentence = detail.blocks[0]!.sentences[0]!.sentence;
  const explanationSentence = {
    ...sentence,
    sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57af3',
    originalText: 'เพราะ',
    translationKo: '왜냐하면',
    tokens: [
      {
        position: 0,
        surface: 'เพราะ',
        startOffset: 0,
        endOffset: 5,
        vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57af4',
        meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57af5',
        pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57af6',
        contextMeaningKo: '왜냐하면',
        pronunciationKo: '프러',
        toneMarks: 'H',
        audioUrl: null,
        role: 'TARGET' as const,
      },
    ],
  };

  return {
    ...base,
    feedback: {
      ...base.feedback,
      explanationBlocks: [
        {
          id: '01933b6a-8f13-7a19-b7e5-536d70f57af7',
          kind: 'EXPLANATION',
          displayMode: 'TEXT',
          position: 0,
          sentences: [
            { position: 0, speaker: null, sentence: explanationSentence },
          ],
        },
      ],
    },
  };
}
