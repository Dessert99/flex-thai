/** 콘텐츠 오류 신고 modal의 preview·선택 설명·성공 흐름을 검증한다 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ContentErrorReportDialog } from './ContentErrorReportDialog';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ContentErrorReportDialog', () => {
  it('자동 첨부 대상을 보여주고 분류와 설명만 제출한다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContentErrorReportDialog
          onSubmit={onSubmit}
          origin={{
            kind: 'VOCABULARY',
            vocabularyId: '00000000-0000-4000-8000-000000000001',
            meaningId: null,
            pronunciationId: null,
          }}
          preview={{ title: 'เข้าใจ', metadata: '어휘 상세' }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '오류 신고' }));
    expect(screen.getByText('เข้าใจ')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('신고 분류'));
    fireEvent.click(await screen.findByRole('option', { name: '뜻·해석' }));
    fireEvent.change(screen.getByLabelText('추가 설명'), {
      target: { value: '뜻이 달라요' },
    });
    fireEvent.click(screen.getByRole('button', { name: '신고 제출' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(
      await screen.findByText('신고가 접수되었습니다.'),
    ).toBeInTheDocument();
  });
});
