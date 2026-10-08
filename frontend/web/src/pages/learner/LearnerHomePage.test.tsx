import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LearnerHomePage } from './LearnerHomePage';

/** 추천 카드 삭제 후에도 학습 화면 진입 경로를 유지한다. */
describe('학습자 홈 페이지', () => {
  it('공용 사전과 내 단어장으로 이동할 수 있다', () => {
    renderWithProviders(<LearnerHomePage />);
    expect(screen.getByRole('heading', { name: '학습 홈' })).toBeVisible();
    expect(screen.getByRole('link', { name: '공용 사전' })).toHaveAttribute(
      'href',
      '/vocabularies',
    );
    expect(screen.getByRole('link', { name: '내 단어장' })).toHaveAttribute(
      'href',
      '/wordbooks',
    );
  });
});
