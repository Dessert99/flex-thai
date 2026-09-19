/** 관리자 어휘 목록의 모든 공개 필터와 상세 링크를 검증한다 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { parseAdminVocabularySearch } from '@/features/learning/libs/vocabulary-management/adminVocabularySearch';
import { VocabularyManagementPage as VocabularyManagementPageContainer } from './VocabularyManagementPage';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
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

it('최근 최종 저장 분류와 전체 목록을 함께 표시한다', async () => {
  mocks.authenticatedRequest.mockImplementation(({ path }: { path: string }) =>
    Promise.resolve(
      path.endsWith('/latest-saved')
        ? {
            sourceName: '독해 자료',
            receipt: {
              savedAt: '2026-09-18T00:00:00.000Z',
              items: [
                {
                  vocabularyId: 'one',
                  meaningId: 'a',
                  thai: 'พัฒนา',
                  meaningKo: '개발하다',
                  classification: 'NEW_WORD',
                },
                {
                  vocabularyId: 'two',
                  meaningId: 'b',
                  thai: 'ขึ้น',
                  meaningKo: '가격이 오르다',
                  classification: 'NEW_MEANING',
                },
              ],
            },
          }
        : {
            items: [
              {
                id: 'old',
                thai: 'กิน',
                kind: 'WORD',
                status: 'DRAFT',
                meaningCount: 1,
              },
            ],
            page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
          },
    ),
  );
  renderWithProviders(
    <VocabularyManagementPageContainer
      onSearchChange={vi.fn()}
      search={{ page: 1, pageSize: 20 }}
    />,
  );
  expect(await screen.findByText('신규 단어 · 1개')).toBeVisible();
  expect(screen.getByText('뜻 추가 단어 · 1개')).toBeVisible();
  expect(screen.getByText('개발하다')).toBeVisible();
  expect(screen.getByText('가격이 오르다')).toBeVisible();
  expect(screen.getByText('전체 단어')).toBeVisible();
  expect(screen.getByText('กิน')).toBeVisible();
});
