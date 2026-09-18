import { beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptDetailPage } from '@/pages/learner/concepts/ConceptDetailPage';
import type { useConceptDetail } from '@/features/learning/hooks/concept-detail/useConceptDetail';
import type { ComponentProps } from 'react';
/** 개념 상세의 목차·표·태국어 예시를 검증한다 */

vi.mock(
  '@/features/learning/components/report-content-error/ContentErrorReportDialog',
  () => ({
    ContentErrorReportDialog: ({
      origin,
      triggerLabel,
    }: {
      origin: unknown;
      triggerLabel: string;
    }) => (
      <button
        data-origin={JSON.stringify(origin)}
        type='button'
      >
        {triggerLabel}
      </button>
    ),
  }),
);

vi.mock(
  '@/features/learning/components/explore-thai-content/InteractiveThaiSentence',
  () => ({
    InteractiveThaiSentence: ({
      sentence,
    }: {
      sentence: { originalText: string };
    }) => <span>{sentence.originalText}</span>,
  }),
);

describe('개념 상세 페이지', () => {
  it('블록 제목 목차와 태국어 예시를 semantic 구조로 렌더링한다', () => {
    const blockId = '33333333-3333-4333-8333-333333333333';
    const conceptId = '11111111-1111-4111-8111-111111111111';
    const conceptVersionId = '22222222-2222-4222-8222-222222222222';
    const sentenceVersionId = '44444444-4444-4444-8444-444444444444';
    render(
      <ConceptDetailPageView
        data={{
          id: conceptId,
          versionId: conceptVersionId,
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
                    sentenceVersionId,
                    originalText: 'ฉันเรียนภาษาไทย',
                    translationKo: '나는 태국어를 공부한다',
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
    expect(
      screen.getByRole('button', { name: '개념 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'CONCEPT',
        conceptId,
        conceptVersionId,
        blockId: null,
      }),
    );
    expect(
      screen.getByRole('button', { name: '개념 블록 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'CONCEPT',
        conceptId,
        conceptVersionId,
        blockId,
      }),
    );
    expect(
      screen.getByRole('button', { name: '예문 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'SENTENCE',
        sentenceVersionId,
        tokenPosition: null,
      }),
    );
  });
});

const pageState = vi.hoisted(() => ({
  read: vi.fn<() => ReturnType<typeof useConceptDetail> | undefined>(),
}));
vi.mock(
  '@/features/learning/hooks/concept-detail/useConceptDetail',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/learning/hooks/concept-detail/useConceptDetail')
      >();
    return {
      ...actual,
      useConceptDetail: (...args: Parameters<typeof useConceptDetail>) =>
        pageState.read() ?? actual.useConceptDetail(...args),
    };
  },
);
beforeEach(() => {
  pageState.read.mockReset();
});
function ConceptDetailPageView(props: ReturnType<typeof useConceptDetail>) {
  pageState.read.mockReturnValue(props);
  return (
    <ConceptDetailPage {...({} as ComponentProps<typeof ConceptDetailPage>)} />
  );
}
