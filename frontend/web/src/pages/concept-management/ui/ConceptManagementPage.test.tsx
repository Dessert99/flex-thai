/** 관리자 개념 목록 필터와 상태 표시를 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptManagementPageView } from './ConceptManagementPageView';

describe('ConceptManagementPageView', () => {
  it('상태·버전·검증 결과를 표시하고 영역 필터를 변경한다', () => {
    const onFilterChange = vi.fn();
    render(
      <ConceptManagementPageView
        createMessage={null}
        createPending={false}
        data={{
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              status: 'PUBLISHED',
              category: 'GRAMMAR',
              position: 0,
              title: '기본 어순',
              latestVersion: 2,
              validationStatus: 'PASSED',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        }}
        error={false}
        loading={false}
        onFilterChange={onFilterChange}
        onCreate={vi.fn()}
        onRetry={vi.fn()}
        search={{ page: 1, pageSize: 20 }}
      />,
    );

    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('개념 영역'), {
      target: { value: 'GRAMMAR' },
    });
    expect(onFilterChange).toHaveBeenCalledWith({
      category: 'GRAMMAR',
      page: 1,
    });
  });

  it('페이지를 이동하고 생성 중 중복 제출을 막으며 실패를 알린다', () => {
    const onFilterChange = vi.fn();
    const onCreate = vi.fn();
    render(
      <ConceptManagementPageView
        createMessage='개념 생성에 실패했습니다.'
        createPending
        data={{
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              status: 'DRAFT',
              category: 'GRAMMAR',
              position: 0,
              title: '기본 어순',
              latestVersion: 1,
              validationStatus: 'PENDING',
            },
          ],
          page: 2,
          pageSize: 20,
          total: 41,
        }}
        error={false}
        loading={false}
        onFilterChange={onFilterChange}
        onCreate={onCreate}
        onRetry={vi.fn()}
        search={{ page: 2, pageSize: 20 }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '개념 생성에 실패했습니다.',
    );
    expect(screen.getByRole('button', { name: '만드는 중…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(onFilterChange).toHaveBeenCalledWith({ page: 3 });
    expect(onCreate).not.toHaveBeenCalled();
  });
});
