/** 문제 상세의 대본 공개와 가용성 충돌 복구 상태를 검증한다 */
import { ApiError } from '@/shared/apis/ApiError';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDialogueQuestion,
  createInteractiveFeedback,
  createQuestionWithInteractiveExplanation,
} from './QuestionSolvingPage.fixtures';
import { QuestionSolvingPageContainer } from './QuestionSolvingPageContainer';
import { QuestionSolvingPageView } from './QuestionSolvingPageView';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));

vi.mock(
  '@/features/learning/components/report-content-error/ContentErrorReportDialog',
  () => ({
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
  }),
);

vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('문제 풀이 페이지', () => {
  it('화자별 대화와 문장 번호 주석을 렌더링한다', () => {
    renderWithProviders(
      <QuestionSolvingPageView
        detail={createDialogueQuestion()}
        onSavedConfirmed={vi.fn()}
      />,
    );

    expect(screen.getByText('A')).toBeVisible();
    expect(screen.getByText('B')).toBeVisible();
    expect(screen.getByText('1번 문장')).toBeVisible();
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

    expect(screen.getAllByRole('dialog')[0]).toHaveTextContent('1번 문장');
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
      screen.getByRole('button', { name: 'เพราะ 뜻과 발음 보기' }),
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
