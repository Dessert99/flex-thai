/** 어휘 상세의 발음 음성·원문·관련 문제 링크를 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyDetailPageContainer } from './VocabularyDetailPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockImplementation(
    ({ path }: { path: string }) => {
      if (path.endsWith('/questions?page=1&pageSize=10')) {
        return Promise.resolve(createRelatedQuestions());
      }
      if (path === '/me/wordbooks') {
        return Promise.resolve({
          items: [
            {
              id: '01933b6a-8f13-7a19-b7e5-536d70f57ab4',
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

    await user.click(
      await screen.findByRole('button', { name: 'ฉัน 뜻과 발음 듣기' }),
    );
    expect(screen.getByText('나')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '단어장에 추가' }));
    expect(
      await screen.findByRole('button', { name: 'FLEX 핵심' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('button button')).toBeNull();
  });
});

function createDetail() {
  return {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
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
