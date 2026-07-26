/** 단어 연습 설정 Container의 목록·검색·생성 상태 연결을 검증한다 */
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { VocabularyPracticeSetupPageContainer } from './VocabularyPracticeSetupPageContainer';

const mocks = vi.hoisted(() => ({ authenticatedRequest: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

const wordbook = {
  id: '00000000-0000-4000-8000-000000000601',
  name: 'FLEX 어휘',
  itemCount: 20,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

const vocabulary = {
  id: '00000000-0000-4000-8000-000000000602',
  thai: 'ไป',
  kind: 'WORD',
  meanings: [
    {
      id: '00000000-0000-4000-8000-000000000603',
      meaningKo: '가다',
      partOfSpeech: '동사',
      difficulty: 1,
      contextNote: null,
    },
  ],
  pronunciations: [],
  saved: false,
};

const emptyVocabularyPage = {
  items: [],
  page: {
    page: 1,
    pageSize: 100,
    totalItems: 0,
    totalPages: 0,
  },
};

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
});

describe('단어 연습 설정 Container', () => {
  it('단어장 요청이 끝나기 전 로딩 상태를 표시한다', () => {
    mocks.authenticatedRequest.mockReturnValue(new Promise(() => undefined));

    renderWithProviders(
      <VocabularyPracticeSetupPageContainer onCreated={vi.fn()} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '단어장을 불러오고 있습니다.',
    );
  });

  it('단어장 실패를 안내하고 사용자 재시도로 설정 화면을 복구한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ items: [wordbook] });

    renderWithProviders(
      <VocabularyPracticeSetupPageContainer onCreated={vi.fn()} />,
    );

    expect(
      await screen.findByText('단어장을 불러오지 못했습니다.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(
      await screen.findByRole('heading', { name: '단어 연습' }),
    ).toBeVisible();
    expect(mocks.authenticatedRequest).toHaveBeenCalledTimes(2);
  });
});

describe('단어 연습 설정 Container의 검색', () => {
  it('검색 중에는 기존 결과 대신 진행 상태를 표시한다', async () => {
    const user = userEvent.setup();
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) =>
        path === '/me/wordbooks'
          ? Promise.resolve({ items: [wordbook] })
          : new Promise(() => undefined),
    );
    renderWithProviders(
      <VocabularyPracticeSetupPageContainer onCreated={vi.fn()} />,
    );
    await screen.findByRole('heading', { name: '단어 연습' });
    await user.click(screen.getByLabelText('공용 어휘 검색'));

    fireEvent.change(screen.getByLabelText('어휘 검색'), {
      target: { value: 'ไป' },
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      '어휘를 검색하고 있습니다.',
    );
  });

  it('검색 결과 선택과 생성 응답의 세션 ID를 이동 경계에 전달한다', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const sessionId = '00000000-0000-4000-8000-000000000604';
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (path === '/me/wordbooks')
          return Promise.resolve({ items: [wordbook] });
        if (path.startsWith('/vocabularies?'))
          return Promise.resolve({
            ...emptyVocabularyPage,
            items: [vocabulary],
            page: { ...emptyVocabularyPage.page, totalItems: 1, totalPages: 1 },
          });
        if (path === '/me/vocabulary-practice/sessions')
          return Promise.resolve({ id: sessionId });
        return Promise.reject(new Error(`예상하지 못한 경로: ${path}`));
      },
    );
    renderWithProviders(
      <VocabularyPracticeSetupPageContainer onCreated={onCreated} />,
    );
    await screen.findByRole('heading', { name: '단어 연습' });
    await user.click(screen.getByLabelText('공용 어휘 검색'));
    fireEvent.change(screen.getByLabelText('어휘 검색'), {
      target: { value: 'ไป' },
    });
    await user.click(await screen.findByRole('button', { name: 'ไป' }));
    await user.click(screen.getByRole('button', { name: '태국어 → 뜻' }));
    await user.click(screen.getByRole('button', { name: '연습 시작' }));

    expect(onCreated).toHaveBeenCalledWith(sessionId);
  });

  it('검색 실패를 표시하고 같은 query를 사용자 재시도로 복구한다', async () => {
    const user = userEvent.setup();
    let searchAttempts = 0;
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (path === '/me/wordbooks') return Promise.resolve({ items: [] });
        if (path.startsWith('/vocabularies?')) {
          searchAttempts += 1;
          return searchAttempts === 1
            ? Promise.reject(new Error('network'))
            : Promise.resolve(emptyVocabularyPage);
        }
        return Promise.reject(new Error(`예상하지 못한 경로: ${path}`));
      },
    );
    renderWithProviders(
      <VocabularyPracticeSetupPageContainer onCreated={vi.fn()} />,
    );
    await screen.findByRole('heading', { name: '단어 연습' });
    await user.click(screen.getByLabelText('공용 어휘 검색'));
    fireEvent.change(screen.getByLabelText('어휘 검색'), {
      target: { value: '없는말' },
    });

    expect(
      await screen.findByText('어휘를 검색하지 못했습니다.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '검색 다시 시도' }));

    expect(await screen.findByText('검색 결과가 없습니다.')).toBeVisible();
    expect(searchAttempts).toBe(2);
  });
});
