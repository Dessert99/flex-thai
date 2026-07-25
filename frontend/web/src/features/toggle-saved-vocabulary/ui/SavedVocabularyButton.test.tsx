/** 어휘 저장 실패가 상태를 바꾸지 않고 인라인으로 안내되는지 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { SavedVocabularyButton } from './SavedVocabularyButton';

const mocks = vi.hoisted(() => ({ changeSavedVocabulary: vi.fn() }));
vi.mock('../api/savedVocabularyMutation', () => ({
  changeSavedVocabulary: mocks.changeSavedVocabulary,
}));

describe('어휘 저장 버튼', () => {
  it('서버 실패 시 저장 상태를 유지하고 안전한 오류를 표시한다', async () => {
    mocks.changeSavedVocabulary.mockRejectedValue(new Error('failed'));
    const user = userEvent.setup();
    renderWithProviders(
      <SavedVocabularyButton
        onConfirmed={vi.fn()}
        saved={false}
        vocabularyId='01933b6a-8f13-7a19-b7e5-536d70f57aaa'
      />,
    );

    await user.click(screen.getByRole('button', { name: '어휘 저장' }));

    expect(
      await screen.findByText('저장 상태를 바꾸지 못했습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '어휘 저장' })).toBeEnabled();
  });
});
