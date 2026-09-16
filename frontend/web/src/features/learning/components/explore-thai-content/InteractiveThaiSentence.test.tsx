import type { PublicThaiSentence } from '@flex-thia/contracts/thai-content/sentences';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InteractiveThaiSentence } from './InteractiveThaiSentence';

const sentence = {
  sentenceVersionId: '00000000-0000-4000-8000-000000000001',
  originalText: 'ฉันรัก',
  translationKo: '나는 사랑한다',
  pronunciationKo: '찬 락',
  toneMarks: 'R H',
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
      representative: true,
    },
  ],
} satisfies PublicThaiSentence;

describe('상호작용 태국어 문장', () => {
  it('번역은 표시를 요청한 문맥에서만 보여 준다', () => {
    const { rerender } = render(
      <InteractiveThaiSentence sentence={sentence} />,
    );

    expect(screen.queryByText('나는 사랑한다')).not.toBeInTheDocument();

    rerender(
      <InteractiveThaiSentence
        sentence={sentence}
        showTranslation
      />,
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
