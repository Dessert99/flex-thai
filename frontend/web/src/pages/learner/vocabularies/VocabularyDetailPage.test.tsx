import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDetail,
  createRelatedQuestions,
} from '@/features/learning/components/vocabulary-detail/VocabularyDetailPage.fixtures';
import { VocabularyDetailPage as VocabularyDetailPageContainer } from './VocabularyDetailPage';
import { VocabularyDetailContent } from '@/pages/learner/vocabularies/VocabularyDetailPage';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
const firstWordbookId = '01933b6a-8f13-7a19-b7e5-536d70f57ab4';
const firstVocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const secondVocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';

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

vi.mock('@/shared/apis/auth/authenticatedRequest', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/shared/apis/auth/authenticatedRequest')
    >();
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
  it('단어장 picker와 예문 token 상호작용을 서로 중첩하지 않고 제공한다', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <VocabularyDetailPageContainer vocabularyId='01933b6a-8f13-7a19-b7e5-536d70f57aaa' />,
    );

    expect(await screen.findByText('나는 온다')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'ฉัน 뜻 보기' }));
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
      <VocabularyDetailContent
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
      <VocabularyDetailContent
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

  it('검증을 통과한 관계의 연관 뜻과 어휘를 표시한다', () => {
    renderWithProviders(
      <VocabularyDetailContent
        detail={createDetail()}
        onWordbookMembershipConfirmed={vi.fn()}
        relatedQuestions={[]}
      />,
    );

    expect(screen.getByText('연관 뜻')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'หวัดดี · 안녕' }),
    ).toBeInTheDocument();
  });
});

describe('어휘 오류 신고 연결', () => {
  it('어휘 하위 콘텐츠별 식별자를 오류 신고 origin에 명시한다', () => {
    const detail = createDetail();
    renderWithProviders(
      <VocabularyDetailContent
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
      screen.getAllByRole('button', { name: '뜻 오류 신고' })[0],
    ).toHaveAttribute(
      'data-origin',
      JSON.stringify({
        kind: 'VOCABULARY',
        vocabularyId: detail.id,
        meaningId: detail.meanings[0]?.id,
      }),
    );
    expect(screen.queryByRole('tab', { name: '발음' })).not.toBeInTheDocument();
  });
});
