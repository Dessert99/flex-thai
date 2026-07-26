/** 어휘 상세의 발음 음성·원문·관련 문제 링크를 검증한다 */
import type { VocabularyDetailResponse } from '@flex-thia/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyDetailPageContainer } from './VocabularyDetailPageContainer';
import { VocabularyDetailPageView } from './VocabularyDetailPageView';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
const firstWordbookId = '01933b6a-8f13-7a19-b7e5-536d70f57ab4';
const firstVocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const secondVocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';

vi.mock('@/features/report-content-error', () => ({
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
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockImplementation(
    ({ method, path }: { method?: string; path: string }) => {
      if (method === 'PUT' || method === 'DELETE') {
        return Promise.resolve();
      }
      if (path.endsWith('/questions?page=1&pageSize=10')) {
        return Promise.resolve(createRelatedQuestions());
      }
      if (path === '/me/wordbooks') {
        return Promise.resolve({
          items: [
            {
              id: firstWordbookId,
              name: 'FLEX 핵심',
              itemCount: 0,
              createdAt: '2026-07-26T00:00:00.000Z',
              updatedAt: '2026-07-26T00:00:00.000Z',
            },
          ],
        });
      }
      if (path.endsWith('/wordbook-memberships')) {
        return Promise.resolve({ wordbookIds: [] });
      }
      return Promise.resolve(createDetail());
    },
  );
});

describe('어휘 상세 페이지', () => {
  it('태국어 원문과 발음 audio, 현재 공개 관련 문제를 표시한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VocabularyDetailPageContainer vocabularyId='01933b6a-8f13-7a19-b7e5-536d70f57aaa' />,
    );

    expect(await screen.findByText('สวัสดี')).toHaveAttribute('lang', 'th');
    await user.click(screen.getByRole('tab', { name: '발음' }));
    expect(screen.getByText('싸왓디')).toBeInTheDocument();
    expect(screen.getByLabelText('สวัสดี 발음')).toHaveAttribute(
      'src',
      'https://example.com/hello.mp3',
    );
    await user.click(screen.getByRole('tab', { name: '관련 문제' }));
    expect(screen.getByRole('link', { name: '인사 표현' })).toHaveAttribute(
      'href',
      '/questions/01933b6a-8f13-7a19-b7e5-536d70f57ab1',
    );
  });

  it('단어장 picker와 예문 token 상호작용을 서로 중첩하지 않고 제공한다', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <VocabularyDetailPageContainer vocabularyId='01933b6a-8f13-7a19-b7e5-536d70f57aaa' />,
    );

    expect(await screen.findByText('나는 온다')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'ฉัน 뜻과 발음 듣기' }),
    );
    expect(screen.getByText('나')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '단어장에 추가' }));
    expect(
      await screen.findByRole('button', { name: 'FLEX 핵심' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('button button')).toBeNull();
  });

  it('route 어휘가 바뀌면 새 membership으로 초기화해 새 어휘를 추가한다', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <VocabularyDetailPageView
        detail={createDetail(firstVocabularyId)}
        onWordbookMembershipConfirmed={vi.fn()}
        relatedQuestions={[]}
      />,
    );
    await user.click(screen.getByRole('button', { name: '단어장에 추가' }));
    const firstMembership = await screen.findByRole('button', {
      name: 'FLEX 핵심',
    });
    await user.click(firstMembership);
    expect(firstMembership).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <VocabularyDetailPageView
        detail={createDetail(secondVocabularyId)}
        onWordbookMembershipConfirmed={vi.fn()}
        relatedQuestions={[]}
      />,
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '단어장에 추가' }));
    const secondMembership = await screen.findByRole('button', {
      name: 'FLEX 핵심',
    });

    expect(secondMembership).toHaveAttribute('aria-pressed', 'false');
    await user.click(secondMembership);
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: `/me/wordbooks/${firstWordbookId}/items/${secondVocabularyId}`,
      }),
    );
  });
});

describe('어휘 오류 신고 연결', () => {
  it('어휘 하위 콘텐츠별 식별자를 오류 신고 origin에 명시한다', async () => {
    const user = userEvent.setup();
    const detail = createDetail();
    renderWithProviders(
      <VocabularyDetailPageView
        detail={detail}
        onWordbookMembershipConfirmed={vi.fn()}
        relatedQuestions={[]}
      />,
    );

    expect(
      screen.getByRole('button', { name: '어휘 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'VOCABULARY',
        vocabularyId: detail.id,
        meaningId: null,
        pronunciationId: null,
      }),
    );
    expect(
      screen.getByRole('button', { name: '예문 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'SENTENCE',
        sentenceVersionId: detail.exampleSentences[0]?.sentenceVersionId,
        tokenPosition: null,
      }),
    );
    expect(
      screen.getByRole('button', { name: '뜻 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'VOCABULARY',
        vocabularyId: detail.id,
        meaningId: detail.meanings[0]?.id,
        pronunciationId: null,
      }),
    );
    await user.click(screen.getByRole('tab', { name: '발음' }));
    expect(
      screen.getByRole('button', { name: '발음 오류 신고' }),
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'AUDIO',
        source: {
          kind: 'VOCABULARY',
          pronunciationId: detail.pronunciations[0]?.id,
        },
      }),
    );
  });
});

function createDetail(
  id: string = firstVocabularyId,
): VocabularyDetailResponse {
  return {
    id,
    thai: 'สวัสดี',
    kind: 'WORD',
    meanings: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aac',
        meaningKo: '안녕하세요',
        partOfSpeech: '감탄사',
        difficulty: 1,
        contextNote: null,
      },
    ],
    pronunciations: [
      {
        id: '01933b6a-8f13-7a19-b7e5-536d70f57aad',
        pronunciationKo: '싸왓디',
        toneMarks: '',
        audioUrl: 'https://example.com/hello.mp3',
      },
    ],
    meaningPronunciations: [],
    exampleSentences: [
      {
        sentenceVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab5',
        originalText: 'ฉันมา',
        translationKo: '나는 온다',
        pronunciationKo: '찬 마',
        toneMarks: 'R M',
        audioUrl: 'https://example.com/sentence.mp3',
        tokens: [
          {
            position: 0,
            surface: 'ฉัน',
            startOffset: 0,
            endOffset: 3,
            vocabularyId: '01933b6a-8f13-7a19-b7e5-536d70f57ab6',
            meaningId: '01933b6a-8f13-7a19-b7e5-536d70f57ab7',
            pronunciationId: '01933b6a-8f13-7a19-b7e5-536d70f57ab8',
            contextMeaningKo: '나',
            pronunciationKo: '찬',
            toneMarks: 'R',
            audioUrl: 'https://example.com/token.mp3',
            role: 'TARGET',
          },
        ],
        expressions: [],
      },
    ],
    saved: false,
  };
}

function createRelatedQuestions() {
  return {
    items: [
      {
        questionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab1',
        questionVersionId: '01933b6a-8f13-7a19-b7e5-536d70f57ab2',
        questionType: {
          id: '01933b6a-8f13-7a19-b7e5-536d70f57ab3',
          slug: 'greeting',
          displayName: '인사 표현',
        },
        skill: 'READING',
        difficulty: 1,
        saved: false,
        firstResult: 'UNANSWERED',
      },
    ],
    page: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  };
}
