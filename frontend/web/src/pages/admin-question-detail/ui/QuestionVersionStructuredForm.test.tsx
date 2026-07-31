/** 구조화 문제 편집의 관계 오류와 음성 무효화 동작을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { QuestionVersionStructuredForm } from './QuestionVersionStructuredForm';

type ReplacePayload = Parameters<
  Parameters<typeof QuestionVersionStructuredForm>[0]['onReplace']
>[0];

beforeEach(() => {
  // jsdom에는 Radix Select가 확인하는 pointer capture API가 없어 실제 선택을 보완한다.
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
});

describe('문제 버전 구조화 편집', () => {
  it('낡은 token offset을 모든 issue path가 있는 접근 가능한 요약으로 표시한다', async () => {
    const onReplace = vi.fn<(replacement: ReplacePayload) => void>();
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionVersionStructuredForm
        disabled={false}
        initialPayload={payload()}
        onReplace={onReplace}
      />,
    );

    const thaiInputs = screen.getAllByLabelText('태국어 문장');
    const firstThaiInput = thaiInputs[0];
    if (!firstThaiInput) throw new Error('태국어 문장 입력이 필요합니다.');
    await user.clear(firstThaiInput);
    await user.type(firstThaiInput, 'สวัสด');
    await user.click(
      screen.getByRole('button', { name: '구조화 내용으로 전체 교체' }),
    );

    const summary = screen.getByRole('alert', { name: '입력 오류 요약' });
    expect(summary).toHaveTextContent('blocks.0.sentences.0.sentence.tokens.0');
    expect(summary).toHaveTextContent(
      'token offset 범위가 원문 안에 있어야 합니다.',
    );
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('발음을 바꾸면 기존 READY media를 지워 새 TTS 대상으로 교체한다', async () => {
    const onReplace = vi.fn<(replacement: ReplacePayload) => void>();
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionVersionStructuredForm
        disabled={false}
        initialPayload={payload()}
        onReplace={onReplace}
      />,
    );

    const pronunciationInputs = screen.getAllByLabelText('한국어 발음');
    const firstPronunciationInput = pronunciationInputs[0];
    if (!firstPronunciationInput) {
      throw new Error('한국어 발음 입력이 필요합니다.');
    }
    await user.clear(firstPronunciationInput);
    await user.type(firstPronunciationInput, '새 발음');
    await user.click(
      screen.getByRole('button', { name: '구조화 내용으로 전체 교체' }),
    );

    const replacement = onReplace.mock.calls[0]?.[0];
    if (!replacement) throw new Error('교체 payload가 필요합니다.');
    const block = replacement.blocks[0];
    if (!block) throw new Error('교체 block이 필요합니다.');
    const sentence = block.sentences[0];
    if (!sentence) throw new Error('교체 문장이 필요합니다.');
    expect(sentence.sentence.mediaAssetId).toBeNull();
  });

  it('공용 정답 Select에서 선택한 보기를 교체 payload에 반영한다', async () => {
    const onReplace = vi.fn<(replacement: ReplacePayload) => void>();
    const initialPayload = payload();
    const firstOption = initialPayload.options[0];
    if (!firstOption) throw new Error('첫 번째 보기가 필요합니다.');
    initialPayload.options.push({
      ...firstOption,
      clientRef: 'option-2',
      position: 1,
    });
    const user = userEvent.setup();
    renderWithProviders(
      <QuestionVersionStructuredForm
        disabled={false}
        initialPayload={initialPayload}
        onReplace={onReplace}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '정답 보기' }));
    await user.click(screen.getByRole('option', { name: '보기 2' }));
    await user.click(
      screen.getByRole('button', { name: '구조화 내용으로 전체 교체' }),
    );

    const replacement = onReplace.mock.calls[0]?.[0];
    if (!replacement) throw new Error('교체 payload가 필요합니다.');
    expect(replacement.correctOptionRef).toBe('option-2');
  });
});

function payload() {
  const sentence = {
    originalText: 'สวัสดี',
    translationKo: '안녕하세요',
    pronunciationKo: '싸왓디',
    toneMarks: '',
    mediaAssetId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    tokens: [
      {
        surface: 'สวัสดี',
        startOffset: 0,
        endOffset: 6,
        vocabulary: { id: '01933b6a-8f13-7a19-b7e5-536d70f57ab1' },
        meaning: { id: '01933b6a-8f13-7a19-b7e5-536d70f57ab2' },
        pronunciation: { id: '01933b6a-8f13-7a19-b7e5-536d70f57ab3' },
        contextMeaningKo: '안녕하세요',
        role: 'TARGET' as const,
      },
    ],
    expressions: [],
  };
  return {
    questionTypeSlug: 'dialogue-choice',
    questionTypeVersion: 1,
    difficulty: 4,
    topicSlug: 'general',
    tagSlugs: [],
    blocks: [
      {
        kind: 'QUESTION' as const,
        displayMode: 'TEXT_AND_AUDIO' as const,
        sentences: [{ speaker: null, sentence }],
      },
    ],
    options: [
      {
        clientRef: 'option-1',
        position: 0,
        sentence,
        span: null,
      },
    ],
    correctOptionRef: 'option-1',
  };
}
