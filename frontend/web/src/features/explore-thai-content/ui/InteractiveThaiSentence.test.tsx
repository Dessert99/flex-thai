/** 태국어 token·표현 피드백과 음성 상호작용을 검증한다 */
import type { PublicThaiSentence } from '@flex-thia/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InteractiveThaiSentence } from './InteractiveThaiSentence';

const sentence = {
  sentenceVersionId: '00000000-0000-4000-8000-000000000001',
  originalText: 'ฉันรัก',
  translationKo: '나는 사랑한다',
  pronunciationKo: '찬 락',
  toneMarks: 'R H',
  audioUrl: 'https://media.example/sentence.mp3',
  tokens: [
    {
      position: 0,
      surface: 'ฉัน',
      startOffset: 0,
      endOffset: 3,
      vocabularyId: '00000000-0000-4000-8000-000000000002',
      meaningId: '00000000-0000-4000-8000-000000000003',
      pronunciationId: '00000000-0000-4000-8000-000000000004',
      contextMeaningKo: '나',
      pronunciationKo: '찬',
      toneMarks: 'R',
      audioUrl: 'https://media.example/shared.mp3',
      role: 'TARGET',
    },
    {
      position: 1,
      surface: 'รัก',
      startOffset: 3,
      endOffset: 6,
      vocabularyId: '00000000-0000-4000-8000-000000000005',
      meaningId: '00000000-0000-4000-8000-000000000006',
      pronunciationId: '00000000-0000-4000-8000-000000000007',
      contextMeaningKo: '사랑하다',
      pronunciationKo: '락',
      toneMarks: 'H',
      audioUrl: 'https://media.example/second.mp3',
      role: 'TARGET',
    },
  ],
  expressions: [
    {
      startTokenIndex: 0,
      endTokenIndex: 2,
      vocabularyId: '00000000-0000-4000-8000-000000000008',
      meaningId: '00000000-0000-4000-8000-000000000009',
      pronunciationId: '00000000-0000-4000-8000-000000000010',
      contextMeaningKo: '나는 사랑한다',
      pronunciationKo: '찬 락',
      toneMarks: 'R H',
      audioUrl: 'https://media.example/expression.mp3',
      representative: true,
    },
  ],
} satisfies PublicThaiSentence;

describe('상호작용 태국어 문장', () => {
  it('focus와 Enter로 token 피드백을 열고 음성을 재생한다', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    render(<InteractiveThaiSentence sentence={sentence} />);
    const token = screen.getByRole('button', {
      name: 'ฉัน 뜻과 발음 듣기',
    });

    token.focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByText('나')).toBeVisible();
    expect(play).toHaveBeenCalledOnce();
  });

  it('새 음성 재생 전 이전 음성을 중지하고 처음으로 되돌린다', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    render(<InteractiveThaiSentence sentence={sentence} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'ฉัน 뜻과 발음 듣기' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'รัก 뜻과 발음 듣기' }),
    );

    expect(pause).toHaveBeenCalledOnce();
  });

  it('음성 재생 거부와 대표 표현을 접근 가능한 상태로 표시한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new Error('blocked'),
    );
    render(<InteractiveThaiSentence sentence={sentence} />);

    await userEvent.click(
      screen.getByRole('button', { name: '표현 ฉันรัก 뜻과 발음 듣기' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      '음성을 재생할 수 없습니다.',
    );
    expect(screen.getByText('나는 사랑한다')).toBeVisible();
  });

  it('token과 표현 control을 중첩하지 않는다', () => {
    const { container } = render(
      <InteractiveThaiSentence sentence={sentence} />,
    );

    expect(container.querySelector('button button')).toBeNull();
  });
});
