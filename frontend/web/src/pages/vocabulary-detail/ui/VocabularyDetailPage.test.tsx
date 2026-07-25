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
  mocks.authenticatedRequest.mockImplementation(({ path }: { path: string }) =>
    Promise.resolve(
      path.endsWith('/questions?page=1&pageSize=10')
        ? createRelatedQuestions()
        : createDetail(),
    ),
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
    exampleSentences: [],
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
