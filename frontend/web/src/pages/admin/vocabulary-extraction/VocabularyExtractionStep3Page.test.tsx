import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { VocabularyExtractionStep3Page } from './VocabularyExtractionStep3Page';
const api = vi.hoisted(() => ({
  getExtractionResults: vi.fn(),
  saveExtractionResults: vi.fn(),
}));
vi.mock(
  '@/features/vocabulary-extraction/apis/vocabulary-extraction/extractionJobApi',
  async (original) => ({
    ...(await original<
      typeof import('@/features/vocabulary-extraction/apis/vocabulary-extraction/extractionJobApi')
    >()),
    ...api,
  }),
);
const items = [
  {
    id: '0:0',
    thai: 'พัฒนา',
    meaningKo: '개발하다',
    partOfSpeech: '동사',
    context: 'พัฒนาเมือง',
    page: 2,
    classification: 'NEW_WORD',
    vocabularyId: null,
    existingMeanings: [],
  },
  {
    id: '0:1',
    thai: 'ขึ้น',
    meaningKo: '가격이 오르다',
    partOfSpeech: '동사',
    context: 'ราคาสินค้าเพิ่มขึ้น',
    page: 6,
    classification: 'NEW_MEANING',
    vocabularyId: 'word',
    existingMeanings: ['올라타다'],
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  api.getExtractionResults.mockResolvedValue({
    items,
    excluded: 3,
    receipt: null,
  });
});
describe('추출 결과 최종 저장', () => {
  it('기존 뜻과 새 뜻을 구분하고 해당 원문·쪽수를 보여준다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VocabularyExtractionStep3Page
        jobId='job'
        sourceName='독해 자료'
      />,
    );
    const buttons = await screen.findAllByRole('button', {
      name: 'ขึ้น 자세히보기',
    });
    const button = buttons[0];
    if (!button) throw new Error('상세 버튼이 없어요');
    await user.click(button);
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('기존에 저장된 뜻')).toBeVisible();
    expect(dialog.getByText('올라타다')).toBeVisible();
    expect(dialog.getByText('이번 문맥에서 추출한 뜻')).toBeVisible();
    expect(dialog.getByText('가격이 오르다')).toBeVisible();
    expect(dialog.getByText('독해 자료 · 6쪽')).toBeVisible();
    expect(dialog.getByText('ราคาสินค้าเพิ่มขึ้น')).toBeVisible();
  });
  it('제외한 항목을 전송하지 않고 저장 실패 후에도 선택을 유지한다', async () => {
    const user = userEvent.setup();
    api.saveExtractionResults
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        savedAt: new Date().toISOString(),
        selectedIds: ['0:1'],
        items: [],
      });
    renderWithProviders(
      <VocabularyExtractionStep3Page
        jobId='job'
        sourceName='독해 자료'
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: 'พัฒนา 삭제하기' }),
    );
    await user.click(screen.getByRole('button', { name: '최종 저장 (1개)' }));
    await screen.findByRole('alert');
    expect(api.saveExtractionResults).toHaveBeenLastCalledWith('job', ['0:1']);
    expect(screen.queryByText('개발하다')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '최종 저장 (1개)' }));
    expect(await screen.findByText(/최종 저장했어요/)).toBeVisible();
    expect(api.saveExtractionResults).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('button', { name: /삭제하기/ }),
    ).not.toBeInTheDocument();
  });
  it('저장 응답을 잃어도 다시 조회한 저장 기록으로 완료 화면을 복원한다', async () => {
    api.getExtractionResults.mockResolvedValue({
      items,
      excluded: 3,
      receipt: {
        savedAt: new Date().toISOString(),
        selectedIds: ['0:0'],
        items: [{ meaningId: 'meaning' }],
      },
    });
    renderWithProviders(
      <VocabularyExtractionStep3Page
        jobId='job'
        sourceName='독해 자료'
      />,
    );
    expect(await screen.findByText(/최종 저장했어요/)).toBeVisible();
    expect(screen.queryByText('가격이 오르다')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /최종 저장/ }),
    ).not.toBeInTheDocument();
    expect(api.saveExtractionResults).not.toHaveBeenCalled();
  });
  it('삭제한 항목을 되돌릴 수 있다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VocabularyExtractionStep3Page
        jobId='job'
        sourceName='독해 자료'
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: 'พัฒนา 삭제하기' }),
    );
    await user.click(
      screen.getByRole('button', { name: '삭제한 1개 되돌리기' }),
    );
    expect(screen.getByText('개발하다')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '최종 저장 (2개)' }),
    ).toBeEnabled();
  });
});

it('미리보기는 조회·저장 API를 호출하지 않는다', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <VocabularyExtractionStep3Page
      jobId='preview'
      sourceName='예시 자료'
      preview
    />,
  );
  await user.click(screen.getByRole('button', { name: '최종 저장 (6개)' }));
  expect(await screen.findByText(/저장 완료 화면 예시예요/)).toBeVisible();
  expect(api.getExtractionResults).not.toHaveBeenCalled();
  expect(api.saveExtractionResults).not.toHaveBeenCalled();
});
