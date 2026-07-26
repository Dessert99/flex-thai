/** 감사 기록 목록·상세의 사용자 상태를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { AuditLogManagementPage } from './AuditLogManagementPage';

const auditId = '00000000-0000-4000-8000-000000000002';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

describe('감사 기록 관리 페이지', () => {
  it('SYSTEM·legacy target 목록을 유지하며 선택 상세를 연다', async () => {
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        Promise.resolve(
          path.includes(auditId)
            ? {
                id: auditId,
                actor: { kind: 'SYSTEM', label: 'migration' },
                action: 'MIGRATED',
                target: 'legacy',
                targetType: null,
                targetId: null,
                createdAt: '2026-07-26T00:00:00.000Z',
                summary: { count: 1 },
                requestId: 'request-1',
              }
            : {
                items: [
                  {
                    id: auditId,
                    actor: { kind: 'SYSTEM', label: 'migration' },
                    action: 'MIGRATED',
                    target: 'legacy',
                    targetType: null,
                    targetId: null,
                    createdAt: '2026-07-26T00:00:00.000Z',
                  },
                ],
                page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
              },
        ),
    );
    const onSearchChange = vi.fn();
    const { rerender } = renderWithProviders(
      <AuditLogManagementPage
        onSearchChange={onSearchChange}
        search={{ page: 1, pageSize: 20 }}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'legacy' }),
    );
    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedAuditId: auditId }),
    );
    rerender(
      <AuditLogManagementPage
        onSearchChange={onSearchChange}
        search={{ page: 1, pageSize: 20, selectedAuditId: auditId }}
      />,
    );
    expect(await screen.findByText('request-1')).toBeInTheDocument();
    expect(screen.getByText('count')).toBeInTheDocument();
  });

  it('필터 변경 시 page를 1로 되돌린다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      items: [],
      page: { page: 2, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    const onSearchChange = vi.fn();
    renderWithProviders(
      <AuditLogManagementPage
        onSearchChange={onSearchChange}
        search={{ page: 2, pageSize: 20 }}
      />,
    );

    await userEvent.type(await screen.findByLabelText('통합 검색'), 'admin');
    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });
});
