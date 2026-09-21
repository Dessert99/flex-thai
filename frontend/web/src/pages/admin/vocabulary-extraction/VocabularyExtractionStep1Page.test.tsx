/** 템플릿의 복사 전용 동작과 입력 유지, 저장·삭제 API 연결을 검증한다 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { VocabularyExtractionStep1Page } from './VocabularyExtractionStep1Page';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/shared/apis/auth/authenticatedRequest', () => ({
  authenticatedRequest: mocks.request,
}));
const template = {
  id: '00000000-0000-4000-8000-000000000001',
  description: '기사의 주요 단어 추출',
  body: '첫 줄 지시문\n둘째 줄 지시문',
  createdAt: '2026-09-18T00:00:00.000Z',
};
beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockResolvedValue({ items: [template] });
});
// eslint-disable-next-line max-lines-per-function -- 입력 유지와 템플릿 API 동작을 한 화면의 시나리오로 검증한다.
describe('단어 추출 자료 입력', () => {
  it('탭과 모달을 바꿔도 입력을 보존하고 복사만 수행한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VocabularyExtractionStep1Page />);
    const prompt = screen.getByLabelText('추출 지시문');
    await user.clear(prompt);
    await user.type(prompt, '직접 작성한 지시문');
    await user.upload(
      screen.getByLabelText('PDF 또는 이미지 파일 선택'),
      new File(['pdf'], '자료.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByText('자료.pdf')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '웹 링크' }));
    await user.type(
      screen.getByLabelText('웹페이지 주소'),
      'https://example.com/article',
    );
    await user.click(screen.getByRole('tab', { name: '파일 업로드' }));
    expect(screen.getByText('자료.pdf')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '웹 링크' }));
    expect(screen.getByLabelText('웹페이지 주소')).toHaveValue(
      'https://example.com/article',
    );
    await user.click(screen.getByRole('button', { name: '템플릿' }));
    await user.click(
      await screen.findByRole('button', { name: template.description }),
    );
    await user.click(screen.getByRole('button', { name: '복사' }));
    expect(await navigator.clipboard.readText()).toBe(template.body);
    expect(prompt).toHaveValue('직접 작성한 지시문');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '닫기',
      }),
    );
    expect(prompt).toHaveValue('직접 작성한 지시문');
    expect(screen.getByRole('button', { name: '추출 시작' })).toBeEnabled();
  });
  it('추가한 템플릿은 API로 저장하고 삭제 뒤 목록에서 제거한다', async () => {
    let items: (typeof template)[] = [];
    mocks.request.mockImplementation(
      (options: {
        method?: string;
        body?: { description: string; body: string };
      }) => {
        if (options.method === 'POST') {
          const created = { ...template, ...options.body };
          items = [created];
          return Promise.resolve(created);
        }
        if (options.method === 'DELETE') {
          items = [];
          return Promise.resolve(undefined);
        }
        return Promise.resolve({ items });
      },
    );
    const user = userEvent.setup();
    renderWithProviders(<VocabularyExtractionStep1Page />);
    await user.click(screen.getByRole('button', { name: '템플릿' }));
    await screen.findByText(
      '저장된 템플릿이 없어요. 새 템플릿을 추가해 보세요.',
    );
    await user.click(screen.getByRole('button', { name: '추가' }));
    await user.type(screen.getByLabelText('설명'), '직접 만든 설명');
    await user.type(screen.getByLabelText('전체 지시문'), '저장할 지시문');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(
      await screen.findByRole('button', { name: '직접 만든 설명' }),
    ).toBeVisible();
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/admin/vocabulary-extraction/templates',
        body: { description: '직접 만든 설명', body: '저장할 지시문' },
      }),
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: '직접 만든 설명' }),
      ).not.toBeInTheDocument(),
    );
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        path: `/admin/vocabulary-extraction/templates/${template.id}`,
      }),
    );
  });
  it('저장 실패 시 입력을 유지하며 재시도할 수 있다', async () => {
    mocks.request.mockImplementation((options: { method?: string }) =>
      options.method === 'POST'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ items: [] }),
    );
    const user = userEvent.setup();
    renderWithProviders(<VocabularyExtractionStep1Page />);
    await user.click(screen.getByRole('button', { name: '템플릿' }));
    await user.click(screen.getByRole('button', { name: '추가' }));
    await user.type(screen.getByLabelText('설명'), '다시 저장');
    await user.type(
      screen.getByLabelText('전체 지시문'),
      '잃으면 안 되는 입력',
    );
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '저장하지 못했어요',
    );
    expect(screen.getByLabelText('전체 지시문')).toHaveValue(
      '잃으면 안 되는 입력',
    );
  });
});

it.each(['image/jpeg', 'image/png', 'image/webp'])(
  '이미지 %s를 자료로 선택한다',
  async (type) => {
    const user = userEvent.setup();
    renderWithProviders(<VocabularyExtractionStep1Page />);
    const filename = `사진.${type.split('/')[1]}`;
    await user.upload(
      screen.getByLabelText('PDF 또는 이미지 파일 선택'),
      new File(['image'], filename, { type }),
    );
    expect(screen.getByText(filename)).toBeVisible();
    expect(screen.getByRole('button', { name: '추출 시작' })).toBeEnabled();
  },
);
