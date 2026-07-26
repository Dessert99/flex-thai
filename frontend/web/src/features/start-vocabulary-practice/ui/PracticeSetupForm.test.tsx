/** 단어 연습 설정의 필수 출처·방식과 생성 요청 조립을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { PracticeSetupForm } from './PracticeSetupForm';

const wordbook = {
  id: '00000000-0000-4000-8000-000000000901',
  name: 'FLEX 어휘',
  itemCount: 20,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

describe('단어 연습 설정 form', () => {
  it('출처와 한 개 이상 방식을 요구한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onSearch={vi.fn()}
        onStart={vi.fn()}
        searchResults={[]}
        wordbooks={[wordbook]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '연습 시작' }));

    expect(screen.getByText('연습할 출처를 선택해 주세요.')).toBeVisible();
    expect(screen.getByText('기억 확인 방식을 선택해 주세요.')).toBeVisible();
  });

  it('단어장·방식·문항 수·순서를 생성 요청으로 조립한다', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn().mockResolvedValue('session-1');
    const onCreated = vi.fn();
    renderWithProviders(
      <PracticeSetupForm
        onCreated={onCreated}
        onSearch={vi.fn()}
        onStart={onStart}
        searchResults={[]}
        wordbooks={[wordbook]}
      />,
    );

    await user.click(screen.getByLabelText('내 단어장'));
    await user.click(screen.getByLabelText('FLEX 어휘'));
    await user.click(screen.getByRole('button', { name: '태국어 → 뜻' }));
    await user.click(screen.getByLabelText('20문항'));
    await user.click(screen.getByLabelText('무작위 순서'));
    await user.click(screen.getByRole('button', { name: '연습 시작' }));

    expect(onStart).toHaveBeenCalledWith({
      source: { type: 'WORDBOOK', wordbookId: wordbook.id },
      modes: ['THAI_TO_MEANING'],
      questionCount: 20,
      order: 'RANDOM',
    });
    expect(onCreated).toHaveBeenCalledWith('session-1');
  });
});
