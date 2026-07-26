/** 개념 상세의 목차·표·태국어 예시를 검증한다 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptDetailPageView } from './ConceptDetailPageView';

vi.mock('@/features/explore-thai-content', () => ({
  InteractiveThaiSentence: ({
    sentence,
  }: {
    sentence: { originalText: string };
  }) => <span>{sentence.originalText}</span>,
}));

describe('ConceptDetailPageView', () => {
  it('블록 제목 목차와 태국어 예시를 semantic 구조로 렌더링한다', () => {
    const blockId = '33333333-3333-4333-8333-333333333333';
    render(
      <ConceptDetailPageView
        data={{
          id: '11111111-1111-4111-8111-111111111111',
          versionId: '22222222-2222-4222-8222-222222222222',
          category: 'GRAMMAR',
          position: 0,
          title: '기본 어순',
          summary: '요약',
          tableOfContents: [{ blockId, heading: '예문', position: 0 }],
          blocks: [
            {
              id: blockId,
              kind: 'THAI_EXAMPLES',
              position: 0,
              heading: '예문',
              examples: [
                {
                  position: 0,
                  noteKo: null,
                  sentence: {
                    sentenceVersionId: '44444444-4444-4444-8444-444444444444',
                    originalText: 'ฉันเรียนภาษาไทย',
                    translationKo: '나는 태국어를 공부한다',
                    pronunciationKo: '찬 리안 파싸 타이',
                    toneMarks: '',
                    audioUrl: null,
                    tokens: [],
                    expressions: [],
                  },
                },
              ],
            },
          ],
        }}
        error={false}
        loading={false}
        notFound={false}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('navigation', { name: '개념 목차' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('ฉันเรียนภาษาไทย').closest('[lang="th"]'),
    ).not.toBeNull();
  });
});
