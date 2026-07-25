/** QueryClient를 포함한 웹 컴포넌트 테스트 렌더링 도우미를 제공한다 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

/** Provider 렌더링 도우미가 받는 선택 설정 */
export interface RenderWithProvidersOptions extends Omit<
  RenderOptions,
  'wrapper'
> {
  queryClient?: QueryClient;
}

/** 테스트 사이에 캐시를 공유하지 않는 QueryClient를 생성한다 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });
}

/** QueryClientProvider와 함께 React 요소를 렌더링한다 */
export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  function TestProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, {
      wrapper: TestProviders,
      ...renderOptions,
    }),
  };
}
