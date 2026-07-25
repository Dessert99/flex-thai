/** 웹 테스트 Provider의 격리와 주입 경계를 검증한다 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  createTestQueryClient,
  renderWithProviders,
} from './renderWithProviders';

describe('Provider를 포함한 렌더링 도우미', () => {
  it('각 테스트에 독립적인 QueryClient를 제공한다', () => {
    const first = createTestQueryClient();
    const second = createTestQueryClient();

    expect(first).not.toBe(second);
    expect(first.getDefaultOptions().queries?.retry).toBe(false);
  });

  it('기본 QueryClient와 함께 UI를 렌더링한다', () => {
    const result = renderWithProviders(<div>학습 화면</div>);

    expect(result.queryClient).toBeInstanceOf(QueryClient);
    expect(screen.getByText('학습 화면')).toBeInTheDocument();
  });

  it('명시적으로 전달한 QueryClient를 유지한다', () => {
    const queryClient = createTestQueryClient();

    const result = renderWithProviders(<div>학습 화면</div>, { queryClient });

    expect(result.queryClient).toBe(queryClient);
  });
});
