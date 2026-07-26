/** 단어장 상세의 검색·페이지·현재 page 선택·상태 화면을 검증한다 */
import type { WordbookItemListResponse } from '@flex-thia/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WordbookDetailPageView } from './WordbookDetailPageView';

const vocabularyId = '00000000-0000-4000-8000-000000000103';
const data: WordbookItemListResponse = {
  wordbook: {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'FLEX 어휘',
    itemCount: 1,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  },
  items: [
    {
      id: vocabularyId,
      thai: 'สวัสดี',
      kind: 'WORD',
      meanings: [],
      pronunciations: [],
      saved: true,
      addedAt: '2026-07-26T00:00:00.000Z',
    },
  ],
  page: {
    page: 2,
    pageSize: 20,
    totalItems: 21,
    totalPages: 2,
  },
};

describe('단어장 상세 페이지', () => {
  it('검색 제출은 page 1로 바꾸고 이전 page를 요청한다', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderView({ onSearchChange });

    await user.type(screen.getByLabelText('단어장 검색'), '안녕');
    await user.click(screen.getByRole('button', { name: '검색' }));
    await user.click(screen.getByRole('button', { name: '이전' }));

    expect(onSearchChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ query: '안녕', page: 1 }),
    );
    expect(onSearchChange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 1 }),
    );
  });

  it('개별과 현재 page 전체 선택을 aria-pressed로 표현한다', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onSelectPage = vi.fn();
    renderView({ onSelectionChange, onSelectPage });

    const item = screen.getByRole('button', { name: '선택' });
    expect(item).toHaveAttribute('aria-pressed', 'false');
    await user.click(item);
    await user.click(screen.getByRole('button', { name: '현재 페이지 전체 선택' }));

    expect(onSelectionChange).toHaveBeenCalledWith(vocabularyId);
    expect(onSelectPage).toHaveBeenCalled();
  });

  it('로딩·오류·빈 상태를 각각 표시한다', () => {
    const { rerender } = renderView({ data: undefined, loading: true });
    expect(screen.getByText('단어장 항목을 불러오고 있습니다.')).toBeVisible();
    rerender(baseView({ data: undefined, error: true }));
    expect(screen.getByText('단어장 항목을 불러오지 못했습니다.')).toBeVisible();
    rerender(baseView({ data: { ...data, items: [] } }));
    expect(screen.getByText('조건에 맞는 어휘가 없습니다.')).toBeVisible();
  });
});

function baseView(overrides: Record<string, unknown> = {}) {
  return (
    <WordbookDetailPageView
      data={data}
      error={false}
      loading={false}
      onRetry={vi.fn()}
      onSearchChange={vi.fn()}
      onSelectionChange={vi.fn()}
      onSelectPage={vi.fn()}
      search={{ page: 2, pageSize: 20 }}
      selectedIds={new Set()}
      {...overrides}
    />
  );
}

function renderView(overrides: Record<string, unknown> = {}) {
  return render(baseView(overrides));
}
