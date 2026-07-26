/** 문제 상세의 대본 공개와 가용성 충돌 복구 상태를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { renderWithProviders } from '@/shared/test';
import {
  createDialogueQuestion,
  createFeedback,
  createInteractiveFeedback,
  createQuestion,
  createQuestionWithInteractiveExplanation,
} from './QuestionSolvingPage.fixtures';
import { QuestionSolvingPageContainer } from './QuestionSolvingPageContainer';
import { QuestionSolvingPageView } from './QuestionSolvingPageView';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock('@/features/report-content-error', () => ({
  ContentErrorReportDialog: ({
    origin,
    triggerLabel,
  }: {
    origin: unknown;
    triggerLabel: string;
  }) => (
    <button
      data-origin={JSON.stringify(origin)}
      type='button'
    >
      {triggerLabel}
    </button>
  ),
}));

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

    await user.click(screen.getByRole('button', { name: '문장별 주석 열기' }));

    expect(
      screen.getAllByRole('button', { name: '1번 문장 뜻과 발음 듣기' }),
    ).toHaveLength(1);
  });

  it('desktop과 mobile 주석 음성을 이어 재생할 때 이전 음성을 중지한다', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionSolvingPageView
        detail={createDialogueQuestion()}
        onSavedConfirmed={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: '1번 문장 뜻과 발음 듣기' }),
    );
    await user.click(screen.getByRole('button', { name: '문장별 주석 열기' }));
    await user.click(
      screen.getByRole('button', { name: '1번 문장 뜻과 발음 듣기' }),
    );

    expect(pause).toHaveBeenCalledOnce();
  });

  it('문장 주석 음성 재생 실패를 접근 가능한 상태로 알린다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new Error('blocked'),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionSolvingPageView
        detail={createDialogueQuestion()}
        onSavedConfirmed={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: '1번 문장 뜻과 발음 듣기' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      '음성을 재생할 수 없습니다.',
    );
  });
});

describe('문제 오류 신고 연결', () => {
  it('문제와 블록 식별자를 오류 신고 origin에 명시한다', () => {
    const detail = createDialogueQuestion();
    renderWithProviders(
      <QuestionSolvingPageView
        detail={detail}
        onSavedConfirmed={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '문제 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'QUESTION',
        questionId: detail.questionId,
        questionVersionId: detail.questionVersionId,
        blockId: null,
        sentenceVersionId: null,
      }),
    );
    expect(
      screen.getByRole('button', { name: '문제 블록 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'QUESTION',
        questionId: detail.questionId,
        questionVersionId: detail.questionVersionId,
        blockId: detail.blocks[0]?.id,
        sentenceVersionId: null,
      }),
    );
  });
});

describe('문제 풀이 제출 결과와 복구', () => {
  it('듣기 대본은 제출 전 숨기고 제출 직후 자동 공개한다', async () => {
    const detail = createQuestion();
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        Promise.resolve(path.endsWith('/attempts') ? createFeedback() : detail),
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
