/** 관리자 개념 목록 필터와 상태 표시를 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptManagementPageView } from './ConceptManagementPageView';

describe('ConceptManagementPageView', () => {
  it('상태·버전·검증 결과를 표시하고 영역 필터를 변경한다', () => {
    const onFilterChange = vi.fn();
    render(
      <ConceptManagementPageView
        data={{
          items: [{
            id: '11111111-1111-4111-8111-111111111111',
            status: 'PUBLISHED',
            category: 'GRAMMAR',
            position: 0,
            title: '기본 어순',
            latestVersion: 2,
            validationStatus: 'PASSED',
          }],
          page: 1,
          pageSize: 20,
          total: 1,
        }}
        error={false}
        loading={false}
        onFilterChange={onFilterChange}
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
});
