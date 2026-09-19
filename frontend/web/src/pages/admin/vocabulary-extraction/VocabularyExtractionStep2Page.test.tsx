import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createProgressPreview } from '@/features/content-production/libs/vocabulary-extraction/extractionProgress';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { VocabularyExtractionStep2Page } from './VocabularyExtractionStep2Page';

describe('단어 추출 진행 화면', () => {
  it('실패한 단계 안에서 저장 범위와 재시도를 제공한다', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <VocabularyExtractionStep2Page
        progress={createProgressPreview('comparison')}
        onRetry={onRetry}
        onReconnect={vi.fn()}
      />,
    );
    const steps = screen.getAllByRole('listitem');
    const extracted = steps[1];
    const failed = steps[2];
    if (!extracted || !failed) throw new Error('처리 단계가 없어요');
    expect(within(extracted).getByText('완료')).toBeVisible();
    expect(within(failed).getByText('기존 단어 대조가 멈췄어요')).toBeVisible();
    await userEvent.click(
      within(failed).getByRole('button', { name: '대조 다시 시도' }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it('연결 끊김에서는 재실행 대신 최신 상태 확인만 요청한다', async () => {
    const onRetry = vi.fn();
    const onReconnect = vi.fn();
    renderWithProviders(
      <VocabularyExtractionStep2Page
        progress={createProgressPreview('offline')}
        onRetry={onRetry}
        onReconnect={onReconnect}
      />,
    );
    expect(screen.getByText('마지막 확인: 진행 중')).toBeVisible();
    expect(screen.queryByText('중단')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: '연결 다시 확인' }),
    );
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });
  it('재시도 요청 중에는 중복 요청을 막는다', () => {
    renderWithProviders(
      <VocabularyExtractionStep2Page
        progress={createProgressPreview('stopped')}
        onRetry={vi.fn()}
        onReconnect={vi.fn()}
        actionPending
      />,
    );
    expect(screen.getByRole('button', { name: '요청 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '결과 보기' })).toBeDisabled();
  });
});
