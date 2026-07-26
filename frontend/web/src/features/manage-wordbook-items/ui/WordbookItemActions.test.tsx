/** 선택 항목 bulk 행동의 disable·성공 invalidate·실패 selection 보존을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { WordbookItemActions } from './WordbookItemActions';

const sourceId = '00000000-0000-4000-8000-000000000101';
const targetId = '00000000-0000-4000-8000-000000000102';
const vocabularyId = '00000000-0000-4000-8000-000000000103';
const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset().mockResolvedValue(undefined);
});

describe('단어장 선택 항목 행동', () => {
  it('선택이 없으면 복사·이동·제거를 비활성화한다', () => {
    renderActions([]);
    expect(screen.getByRole('button', { name: '복사' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이동' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '선택 제거' })).toBeDisabled();
  });

  it('대상 선택 후 복사 성공 시 관련 cache를 무효화하고 선택을 초기화한다', async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    const rendered = renderActions([vocabularyId], onConfirmed);
    const invalidate = vi.spyOn(rendered.queryClient, 'invalidateQueries');

    await user.selectOptions(screen.getByLabelText('대상 단어장'), targetId);
    await user.click(screen.getByRole('button', { name: '복사' }));

    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { targetWordbookId: targetId, vocabularyIds: [vocabularyId] },
        method: 'POST',
        path: `/me/wordbooks/${sourceId}/items/copy`,
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['learner', 'wordbooks'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['learner', 'vocabularies'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['learner', 'vocabulary'],
    });
    expect(onConfirmed).toHaveBeenCalled();
  });

  it('제거 실패 시 선택을 유지하고 오류를 표시한다', async () => {
    mocks.authenticatedRequest.mockRejectedValue(new Error('failed'));
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    renderActions([vocabularyId], onConfirmed);

    await user.click(screen.getByRole('button', { name: '선택 제거' }));
    await user.click(screen.getByRole('button', { name: '제거 확인' }));

    expect(
      await screen.findByText('선택 항목을 변경하지 못했습니다.'),
    ).toBeVisible();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

function renderActions(selectedIds: string[], onConfirmed = vi.fn()) {
  return renderWithProviders(
    <WordbookItemActions
      onConfirmed={onConfirmed}
      selectedIds={selectedIds}
      sourceWordbookId={sourceId}
      wordbooks={[
        { id: sourceId, name: '원본' },
        { id: targetId, name: '대상' },
      ]}
    />,
  );
}
