/** 공용 페이지 상태가 사용자에게 명확한 피드백과 복구 동작을 주는지 검증한다 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageEmpty, PageError, PageLoading } from './PageState';

describe('PageLoading', () => {
  it('진행 중인 작업을 상태 메시지로 알린다', () => {
    render(<PageLoading message='문제를 불러오는 중입니다.' />);

    expect(screen.getByRole('status')).toHaveTextContent(
      '문제를 불러오는 중입니다.',
    );
  });
});

describe('PageEmpty', () => {
  it('빈 상태의 제목과 설명을 제공한다', () => {
    render(
      <PageEmpty
        title='아직 학습 기록이 없습니다.'
        description='첫 문제를 풀어보세요.'
      />,
    );

    expect(
      screen.getByRole('heading', { name: '아직 학습 기록이 없습니다.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('첫 문제를 풀어보세요.')).toBeInTheDocument();
  });
});

describe('PageError', () => {
  it('오류 설명과 명시적인 재시도 동작을 제공한다', async () => {
    const onRetry = vi.fn();
    render(
      <PageError
        message='불러오지 못했습니다.'
        requestId='request-123'
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('request-123');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
