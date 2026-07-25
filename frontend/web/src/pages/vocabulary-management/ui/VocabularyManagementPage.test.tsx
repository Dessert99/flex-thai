/** 관리자 어휘 목록의 모든 공개 필터와 상세 링크를 검증한다 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { parseAdminVocabularySearch } from '../model/adminVocabularySearch';
import { VocabularyManagementPageContainer } from './VocabularyManagementPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

describe('관리자 어휘 목록', () => {
  it('query, kind, status, page, pageSize를 정확한 이름으로 전송한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      items: [],
      page: { page: 2, pageSize: 50, totalItems: 0, totalPages: 0 },
    });
    renderWithProviders(
      <VocabularyManagementPageContainer
        onSearchChange={vi.fn()}
        search={{
          query: 'สวัสดี',
          kind: 'WORD',
          status: 'HIDDEN',
          page: 2,
          pageSize: 50,
        }}
      />,
    );
    await screen.findByText('조건에 맞는 어휘가 없습니다.');
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path:
          '/admin/vocabularies?query=%E0%B8%AA%E0%B8%A7%E0%B8%B1%E0%B8%AA%E0%B8%94%E0%B8%B5' +
          '&kind=WORD&status=HIDDEN&page=2&pageSize=50',
      }),
    );
  });

  it('지원하지 않는 검색값을 거부한다', () => {
    expect(() => parseAdminVocabularySearch({ merge: true })).toThrow();
    expect(() => parseAdminVocabularySearch({ kind: 'PHRASE' })).toThrow();
  });
});
