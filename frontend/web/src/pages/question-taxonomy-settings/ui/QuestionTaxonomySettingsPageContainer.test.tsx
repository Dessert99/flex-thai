/** 문제 유형 설정 container의 사용자 명령 연결을 검증한다 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  AdminQuestionVersionPayload,
  QuestionTaxonomySettingsResponse,
} from '@flex-thia/contracts';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionTaxonomySettingsPageContainer } from './QuestionTaxonomySettingsPageContainer';

const mocks = vi.hoisted(() => ({
  addApprovedExample: vi.fn(),
  archiveTaxonomyTerm: vi.fn(),
  changeQuestionTypeVersionStatus: vi.fn(),
  createQuestionType: vi.fn(),
  createQuestionTypeVersion: vi.fn(),
  createTaxonomyTerm: vi.fn(),
  queryFn: vi.fn(),
  replaceDifficultyCriteria: vi.fn(),
}));

vi.mock('../api/questionTaxonomyQueries', () => ({
  ...mocks,
  questionTaxonomySettingsQueryOptions: () => ({
    queryKey: ['admin', 'question-taxonomy'],
    queryFn: mocks.queryFn,
  }),
}));

const sentencePayload = {
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  mediaAssetId: '00000000-0000-4000-8000-000000000005',
  tokens: [],
  expressions: [],
};
const examplePayload: AdminQuestionVersionPayload = {
  questionTypeSlug: 'reading-vocabulary',
  questionTypeVersion: 1,
  difficulty: 3,
  topicSlug: 'general',
  tagSlugs: [],
  blocks: [
    {
      kind: 'QUESTION',
      displayMode: 'TEXT',
      sentences: [{ speaker: null, sentence: sentencePayload }],
    },
  ],
  options: ['a', 'b', 'c', 'd'].map((clientRef, position) => ({
    clientRef,
    position,
    sentence: sentencePayload,
    span: null,
  })),
  correctOptionRef: 'a',
};
const version: QuestionTaxonomySettingsResponse['questionTypes'][number]['versions'][number] =
  {
    id: '00000000-0000-4000-8000-000000000002',
    version: 1,
    status: 'DRAFT',
    template: 'STANDARD_CHOICE',
    optionCount: 4,
    decisionRules: { mode: 'single-choice' },
    difficultyCriteria: [1, 2, 3, 4, 5].map((difficulty) => ({
      difficulty,
      criteria: `${difficulty}단계`,
    })),
    approvedExamples: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        title: '예시',
        payload: examplePayload,
      },
    ],
  };

const data = {
  questionTypes: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'reading-vocabulary',
      displayName: '어휘·문법',
      majorCategory: 'READING_VOCABULARY_GRAMMAR',
      versions: [
        version,
        {
          ...version,
          id: '00000000-0000-4000-8000-000000000007',
          version: 2,
          status: 'ACTIVE',
        },
      ],
    },
  ],
  topics: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      slug: 'general',
      displayName: '일반',
      status: 'ACTIVE',
    },
  ],
  tags: [
    {
      id: '00000000-0000-4000-8000-000000000006',
      slug: 'formal',
      displayName: '격식',
      status: 'ACTIVE',
    },
  ],
} satisfies QuestionTaxonomySettingsResponse;

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.queryFn.mockResolvedValue(data);
  Object.entries(mocks)
    .filter(([name]) => name !== 'queryFn')
    .forEach(([, mock]) => mock.mockResolvedValue(undefined));
});

describe('문제 유형 설정 container', () => {
  it('생성·저장·상태 전이 화면 명령을 mutation으로 전달한다', async () => {
    const user = userEvent.setup();
    renderContainer();
    await screen.findByRole('heading', { name: '문제 유형 설정' });
    await user.type(screen.getByLabelText('세부 유형 slug'), 'conversation');
    await user.type(screen.getByLabelText('세부 유형 이름'), '대화 이해');
    await user.click(screen.getByRole('button', { name: '세부 유형 만들기' }));
    await waitFor(() =>
      expect(mocks.createQuestionType).toHaveBeenCalledOnce(),
    );
    fireEvent.change(screen.getByLabelText('vNext 판정 규칙 JSON'), {
      target: { value: '{"mode":"single-choice"}' },
    });
    await user.click(
      screen.getByRole('button', { name: 'vNext DRAFT 만들기' }),
    );
    await waitFor(() =>
      expect(mocks.createQuestionTypeVersion).toHaveBeenCalledOnce(),
    );
    await user.clear(screen.getByLabelText('난이도 3'));
    await user.type(screen.getByLabelText('난이도 3'), '새 3단계 기준');
    await user.click(screen.getByRole('button', { name: '난이도 기준 저장' }));
    await waitFor(() =>
      expect(mocks.replaceDifficultyCriteria).toHaveBeenCalledOnce(),
    );
    await user.type(screen.getByLabelText('v1 승인 예시 이름'), '추가 예시');
    fireEvent.change(screen.getByLabelText('v1 승인 예시 JSON'), {
      target: { value: JSON.stringify(examplePayload) },
    });
    await user.click(screen.getByRole('button', { name: '승인 예시 추가' }));
    await waitFor(() =>
      expect(mocks.addApprovedExample).toHaveBeenCalledOnce(),
    );
    await user.click(screen.getByRole('button', { name: 'v1 활성화' }));
    await user.click(screen.getByRole('button', { name: 'v2 사용 종료' }));
    await waitFor(() =>
      expect(mocks.changeQuestionTypeVersionStatus).toHaveBeenCalledTimes(2),
    );
  });

  it('주제·태그 생성과 활성 항목 보관 명령을 mutation으로 전달한다', async () => {
    const user = userEvent.setup();
    renderContainer();
    await screen.findByRole('heading', { name: '문제 유형 설정' });
    const topicSection = screen
      .getByRole('heading', { name: '주제 설정' })
      .closest('section');
    const tagSection = screen
      .getByRole('heading', { name: '태그 설정' })
      .closest('section');
    expect(topicSection).not.toBeNull();
    expect(tagSection).not.toBeNull();
    if (!topicSection || !tagSection) return;
    await user.type(within(topicSection).getByLabelText('주제 slug'), 'travel');
    await user.type(within(topicSection).getByLabelText('주제 이름'), '여행');
    await user.click(
      within(topicSection).getByRole('button', { name: '주제 만들기' }),
    );
    await user.click(
      within(topicSection).getByRole('button', { name: '보관' }),
    );
    await user.type(within(tagSection).getByLabelText('태그 slug'), 'casual');
    await user.type(within(tagSection).getByLabelText('태그 이름'), '일상');
    await user.click(
      within(tagSection).getByRole('button', { name: '태그 만들기' }),
    );
    await user.click(within(tagSection).getByRole('button', { name: '보관' }));
    await waitFor(() => {
      expect(mocks.createTaxonomyTerm).toHaveBeenCalledTimes(2);
      expect(mocks.archiveTaxonomyTerm).toHaveBeenCalledTimes(2);
    });
  });

  it('불러오기 실패 뒤 재시도 버튼으로 설정 query를 다시 요청한다', async () => {
    mocks.queryFn
      .mockRejectedValueOnce(new Error('실패'))
      .mockResolvedValueOnce(data);
    const user = userEvent.setup();
    renderContainer();
    await user.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(
      await screen.findByRole('heading', { name: '문제 유형 설정' }),
    ).toBeVisible();
  });
});

function renderContainer() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <QuestionTaxonomySettingsPageContainer />
    </QueryClientProvider>,
  );
}
