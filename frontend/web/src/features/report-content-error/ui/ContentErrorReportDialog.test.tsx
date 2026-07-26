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
    expect(screen.getByRole('button', { name: '신고 제출' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('신고 분류'));
    expect(await screen.findAllByRole('option')).toHaveLength(6);
    fireEvent.click(await screen.findByRole('option', { name: '뜻·해석' }));
    expect(screen.getByLabelText('추가 설명')).toHaveAttribute(
      'maxlength',
      '1000',
    );
    fireEvent.change(screen.getByLabelText('추가 설명'), {
      target: { value: '뜻이 달라요' },
    });
    fireEvent.click(screen.getByRole('button', { name: '신고 제출' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      origin: {
        kind: 'VOCABULARY',
        vocabularyId: '00000000-0000-4000-8000-000000000001',
        meaningId: null,
        pronunciationId: null,
      },
      category: 'MEANING_TRANSLATION',
      description: '뜻이 달라요',
    });
    expect(
      await screen.findByText('신고가 접수되었습니다.'),
    ).toBeInTheDocument();
  });

  it('API 오류 뒤 입력을 유지하고 재시도하며 닫으면 trigger로 focus가 돌아간다', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('실패'))
      .mockResolvedValueOnce(undefined);
    render(
      <ContentErrorReportDialog
        onSubmit={onSubmit}
        origin={{
          kind: 'SENTENCE',
          sentenceVersionId: '00000000-0000-4000-8000-000000000001',
          tokenPosition: null,
        }}
        preview={{ title: '문장', metadata: '개념 학습' }}
      />,
    );
    const trigger = screen.getByRole('button', { name: '오류 신고' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText('신고 분류'));
    fireEvent.click(await screen.findByRole('option', { name: '기타' }));
    fireEvent.change(screen.getByLabelText('추가 설명'), {
      target: { value: ' 유지할 설명 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '신고 제출' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('추가 설명')).toHaveValue(' 유지할 설명 ');
    fireEvent.click(screen.getByRole('button', { name: '신고 제출' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('ContentErrorReportDialog 재개방', () => {
  it.each([
    ['성공', vi.fn().mockResolvedValue(undefined)],
    ['오류', vi.fn().mockRejectedValue(new Error('실패'))],
  ] as const)(
    '%s 뒤 닫고 다시 열면 새 신고 form으로 초기화한다',
    async (_state, onSubmit) => {
      render(
        <ContentErrorReportDialog
          onSubmit={onSubmit}
          origin={{
            kind: 'SENTENCE',
            sentenceVersionId: '00000000-0000-4000-8000-000000000001',
            tokenPosition: null,
          }}
          preview={{ title: '문장', metadata: '문제' }}
        />,
      );
      const trigger = screen.getByRole('button', { name: '오류 신고' });
      fireEvent.click(trigger);
      fireEvent.click(screen.getByLabelText('신고 분류'));
      fireEvent.click(await screen.findByRole('option', { name: '기타' }));
      fireEvent.change(screen.getByLabelText('추가 설명'), {
        target: { value: '초기화할 설명' },
      });
      fireEvent.click(screen.getByRole('button', { name: '신고 제출' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(trigger).toHaveFocus());

      fireEvent.click(trigger);

      expect(screen.getByRole('button', { name: '신고 제출' })).toBeDisabled();
      expect(screen.getByLabelText('추가 설명')).toHaveValue('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.queryByText('신고가 접수되었습니다.'),
      ).not.toBeInTheDocument();
    },
  );
});
