/** 개념 카드 홈의 탭과 page state를 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptListPageView } from './ConceptListPageView';

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
    fireEvent.click(screen.getByRole('tab', { name: '태국 문자·발음' }));
    expect(onCategoryChange).toHaveBeenCalledWith(
      'THAI_SCRIPT_PRONUNCIATION',
    );
  });
});
