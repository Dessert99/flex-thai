import { createQuestion } from '@/features/learning/components/question-solving/QuestionSolvingPage.fixtures';
import { QuestionSolvingPageView } from '@/features/learning/components/question-solving/QuestionSolvingPageView';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock(
  '@/features/learning/components/report-content-error/ContentErrorReportDialog',
  () => ({ ContentErrorReportDialog: () => null }),
);
vi.mock(
  '@/features/learning/components/toggle-saved-question/SavedQuestionButton',
  () => ({ SavedQuestionButton: () => null }),
);
describe('일반 텍스트 문제 풀이', () => {
  it('지문과 보기 텍스트를 표시하고 제출 전 해설은 숨긴다', () => {
    renderWithProviders(
      <QuestionSolvingPageView
        detail={createQuestion()}
        onSavedConfirmed={() => undefined}
      />,
    );
    expect(screen.getByText('สวัสดีครับ')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'สวัสดี' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: '해설' }),
    ).not.toBeInTheDocument();
  });
  it('수정된 문제는 다시 풀기 안내를 표시한다', () => {
    renderWithProviders(
      <QuestionSolvingPageView
        detail={{ ...createQuestion(), firstResult: 'UPDATED' }}
        onSavedConfirmed={() => undefined}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '문제가 수정되었습니다',
    );
  });
});
