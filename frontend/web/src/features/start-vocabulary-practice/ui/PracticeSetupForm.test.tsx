/** 단어 연습 설정의 필수 출처·방식과 생성 요청 조립을 검증한다 */
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { PracticeSetupForm } from './PracticeSetupForm';

const vocabulary = {
  id: '00000000-0000-4000-8000-000000000902',
  thai: 'ไป',
  kind: 'WORD' as const,
  meanings: [
    {
      id: '00000000-0000-4000-8000-000000000903',
      meaningKo: '가다',
      partOfSpeech: '동사',
      difficulty: 1,
      contextNote: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000904',
      meaningKo: '떠나다',
      partOfSpeech: '동사',
      difficulty: 1,
      contextNote: null,
    },
  ],
  pronunciations: [],
  audioEligibleMeaningCount: 1,
  saved: false,
};

const wordbook = {
  id: '00000000-0000-4000-8000-000000000901',
  name: 'FLEX 어휘',
  itemCount: 20,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

describe('단어 연습 설정 form', () => {
  it('출처와 한 개 이상 방식을 요구한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={vi.fn()}
        searchState='IDLE'
        searchResults={[]}
        wordbooks={[wordbook]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '연습 시작' }));

    expect(screen.getByText('연습할 출처를 선택해 주세요.')).toBeVisible();
    expect(screen.getByText('기억 확인 방식을 선택해 주세요.')).toBeVisible();
  });

  it('단어장·방식·문항 수·순서를 생성 요청으로 조립한다', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn().mockResolvedValue('session-1');
    const onCreated = vi.fn();
    renderWithProviders(
      <PracticeSetupForm
        onCreated={onCreated}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={onStart}
        searchState='IDLE'
        searchResults={[]}
        wordbooks={[wordbook]}
      />,
    );

    await user.click(screen.getByLabelText('내 단어장'));
    await user.click(screen.getByLabelText('FLEX 어휘'));
    await user.click(screen.getByRole('button', { name: '태국어 → 뜻' }));
    await user.click(screen.getByLabelText('20문항'));
    await user.click(screen.getByLabelText('무작위 순서'));
    await user.click(screen.getByRole('button', { name: '연습 시작' }));

    expect(onStart).toHaveBeenCalledWith({
      source: { type: 'WORDBOOK', wordbookId: wordbook.id },
      modes: ['THAI_TO_MEANING'],
      questionCount: 20,
      order: 'RANDOM',
    });
    expect(onCreated).toHaveBeenCalledWith('session-1');
  });
});

describe('단어 연습 설정의 검색 선택', () => {
  it('검색 선택 ID만 strict 생성 요청에 담는다', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn().mockResolvedValue('session-2');
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={onStart}
        searchResults={[vocabulary]}
        searchState='SUCCESS'
        wordbooks={[]}
      />,
    );

    await user.click(screen.getByLabelText('공용 어휘 검색'));
    await user.type(screen.getByLabelText('어휘 검색'), 'ไป');
    await user.click(screen.getByRole('button', { name: 'ไป' }));
    expect(screen.getByText('선택 1 / 100')).toBeVisible();
    expect(screen.getByText('연습 가능 어의 2개')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '음성 → 태국어' }));
    expect(screen.getByText('연습 가능 어의 1개')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '연습 시작' }));

    expect(onStart).toHaveBeenCalledWith({
      source: {
        type: 'SEARCH_SELECTION',
        vocabularyIds: [vocabulary.id],
      },
      modes: ['AUDIO_TO_THAI'],
      questionCount: 10,
      order: 'SOURCE',
    });
  });

  it('검색 어휘 선택은 100개에서 추가 선택을 막는다', async () => {
    const user = userEvent.setup();
    const searchResults = Array.from({ length: 101 }, (_, index) => ({
      ...vocabulary,
      id: `00000000-0000-4000-8000-${String(100_000_000_000 + index)}`,
      thai: `단어-${index + 1}`,
    }));
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={vi.fn()}
        searchResults={searchResults}
        searchState='SUCCESS'
        wordbooks={[]}
      />,
    );
    await user.click(screen.getByLabelText('공용 어휘 검색'));
    await user.type(screen.getByLabelText('어휘 검색'), '단어');
    const vocabularyButtons = searchResults.map(({ thai }) =>
      screen.getByRole('button', { name: thai }),
    );
    act(() => {
      vocabularyButtons.slice(0, 100).forEach((button) => button.click());
    });

    expect(screen.getByText('선택 100 / 100')).toBeVisible();
    expect(screen.getByRole('button', { name: '단어-101' })).toBeDisabled();
  });
});

describe('단어 연습 생성 요청 상태', () => {
  it('생성 실패 메시지를 보여주고 같은 선택으로 재시도한다', async () => {
    const user = userEvent.setup();
    const onStart = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('session-3');
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={onStart}
        searchResults={[]}
        searchState='IDLE'
        wordbooks={[wordbook]}
      />,
    );
    await user.click(screen.getByLabelText('내 단어장'));
    await user.click(screen.getByLabelText('FLEX 어휘'));
    await user.click(screen.getByRole('button', { name: '태국어 → 뜻' }));

    await user.click(screen.getByRole('button', { name: '연습 시작' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '연습을 시작하지 못했습니다.',
    );
    await user.click(screen.getByRole('button', { name: '연습 시작' }));

    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onStart.mock.calls[1]).toEqual(onStart.mock.calls[0]);
  });

  it('생성 중 설정과 중복 제출을 막는다', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn(() => new Promise<string>(() => undefined));
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={onStart}
        searchResults={[]}
        searchState='IDLE'
        wordbooks={[wordbook]}
      />,
    );
    await user.click(screen.getByLabelText('내 단어장'));
    await user.click(screen.getByLabelText('FLEX 어휘'));
    await user.click(screen.getByRole('button', { name: '태국어 → 뜻' }));
    const start = screen.getByRole('button', { name: '연습 시작' });

    await user.click(start);
    await user.click(start);

    expect(start).toBeDisabled();
    expect(screen.getByLabelText('20문항')).toBeDisabled();
    expect(onStart).toHaveBeenCalledOnce();
  });
});

describe('단어 연습 설정의 빈 상태와 오류', () => {
  it.each([
    ['LOADING', '어휘를 검색하고 있습니다.'],
    ['SUCCESS', '검색 결과가 없습니다.'],
  ] as const)('검색 %s 상태를 안내한다', async (searchState, message) => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={vi.fn()}
        searchResults={[]}
        searchState={searchState}
        wordbooks={[]}
      />,
    );
    await user.click(screen.getByLabelText('공용 어휘 검색'));
    await user.type(screen.getByLabelText('어휘 검색'), '없는말');

    expect(screen.getByText(message)).toBeVisible();
  });

  it('검색 실패를 안내하고 다시 시도한다', async () => {
    const user = userEvent.setup();
    const onRetrySearch = vi.fn();
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={onRetrySearch}
        onSearch={vi.fn()}
        onStart={vi.fn()}
        searchResults={[]}
        searchState='ERROR'
        wordbooks={[]}
      />,
    );
    await user.click(screen.getByLabelText('공용 어휘 검색'));
    await user.type(screen.getByLabelText('어휘 검색'), 'ไป');
    await user.click(screen.getByRole('button', { name: '검색 다시 시도' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '어휘를 검색하지 못했습니다.',
    );
    expect(onRetrySearch).toHaveBeenCalledOnce();
  });

  it('비어 있는 단어장 상태를 안내한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PracticeSetupForm
        onCreated={vi.fn()}
        onRetrySearch={vi.fn()}
        onSearch={vi.fn()}
        onStart={vi.fn()}
        searchResults={[]}
        searchState='IDLE'
        wordbooks={[]}
      />,
    );
    await user.click(screen.getByLabelText('내 단어장'));

    expect(screen.getByText('저장한 단어장이 없습니다.')).toBeVisible();
  });
});
