/** 비로그인 방문자가 소개를 읽고 학습 시작 경로를 찾을 수 있다. */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('공개 소개와 학습 시작 링크를 표시한다', () => {
    renderWithProviders(<LandingPage />);
    expect(
      screen.getByRole('heading', { name: 'FLEX 태국어 학습' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'app-main');
    expect(screen.getByRole('link', { name: '학습 시작' })).toHaveAttribute(
      'href',
      '/learn',
    );
  });
});
