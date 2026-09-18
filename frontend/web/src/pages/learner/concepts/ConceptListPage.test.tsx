import { beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/shared/test/renderWithProviders';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptListPage } from '@/pages/learner/concepts/ConceptListPage';
import type { useConceptList } from '@/features/learning/hooks/concept-list/useConceptList';
import type { ComponentProps } from 'react';
/** 개념 카드 홈의 탭과 page state를 검증한다 */

describe('ConceptListPageView', () => {
  it('두 영역 탭과 게시 개념 카드를 렌더링한다', () => {
    const onCategoryChange = vi.fn();
    render(
      <ConceptListPageView
        category='GRAMMAR'
        data={{
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              category: 'GRAMMAR',
              position: 0,
              title: '기본 어순',
              summary: '태국어 기본 어순',
            },
          ],
        }}
        error={false}
        loading={false}
        onCategoryChange={onCategoryChange}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('기본 어순')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '태국 문자' }));
    expect(onCategoryChange).toHaveBeenCalledWith('THAI_SCRIPT');
  });
});

const pageState = vi.hoisted(() => ({
  read: vi.fn<() => ReturnType<typeof useConceptList> | undefined>(),
}));
vi.mock(
  '@/features/learning/hooks/concept-list/useConceptList',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/learning/hooks/concept-list/useConceptList')
      >();
    return {
      ...actual,
      useConceptList: (...args: Parameters<typeof useConceptList>) =>
        pageState.read() ?? actual.useConceptList(...args),
    };
  },
);
beforeEach(() => {
  pageState.read.mockReset();
});
function ConceptListPageView(props: ReturnType<typeof useConceptList>) {
  pageState.read.mockReturnValue(props);
  return (
    <ConceptListPage {...({} as ComponentProps<typeof ConceptListPage>)} />
  );
}
