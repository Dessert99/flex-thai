/** 관리자 문제 분류 설정 화면 동작을 검증한다 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  AdminQuestionVersionPayload,
  QuestionTaxonomySettingsResponse,
} from '@flex-thia/contracts';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { QuestionTaxonomySettingsPageView } from './QuestionTaxonomySettingsPageView';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

type QuestionType = QuestionTaxonomySettingsResponse['questionTypes'][number];
type QuestionTypeVersion = QuestionType['versions'][number];

const questionTypeVersion = {
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
  approvedExamples: [],
} satisfies QuestionTypeVersion;

const questionType = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'reading-vocabulary',
  displayName: '어휘·문법',
  majorCategory: 'READING_VOCABULARY_GRAMMAR',
  versions: [questionTypeVersion],
} satisfies QuestionType;

const data = {
  questionTypes: [questionType],
  topics: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      slug: 'general',
      displayName: '일반',
      status: 'ACTIVE',
    },
  ],
  tags: [],
} satisfies QuestionTaxonomySettingsResponse;

const approvedSentence = {
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  mediaAssetId: '00000000-0000-4000-8000-000000000005',
  tokens: [],
  expressions: [],
};

const approvedExamplePayload = {
  questionTypeSlug: 'reading-vocabulary',
  questionTypeVersion: 1,
  difficulty: 3,
  topicSlug: 'general',
  tagSlugs: [],
  blocks: [
    {
      kind: 'QUESTION',
      displayMode: 'TEXT',
      sentences: [
        {
          speaker: null,
          sentence: approvedSentence,
        },
      ],
    },
  ],
  options: ['a', 'b', 'c', 'd'].map((clientRef, position) => ({
    clientRef,
    position,
    sentence: approvedSentence,
    span: null,
  })),
  correctOptionRef: 'a',
} satisfies AdminQuestionVersionPayload;

describe('문제 유형 설정 화면', () => {
  it('7대 분류와 세부 유형의 준비 상태를 표시한다', () => {
    render(
      <QuestionTaxonomySettingsPageView
        data={data}
        error={false}
        loading={false}
        onActivate={vi.fn()}
        onArchiveTerm={vi.fn()}
        onCreateTerm={vi.fn()}
        onCreateType={vi.fn()}
        onCreateVersion={vi.fn()}
        onRetry={vi.fn()}
        onRetire={vi.fn()}
        onSaveCriteria={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: '문제 유형 설정' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: '반응 테스트' })).toBeVisible();
    expect(screen.getAllByRole('heading', { name: '어휘·문법' })).toHaveLength(
      2,
    );
    expect(screen.getByText('승인 예시가 필요합니다.')).toBeVisible();
  });
});

describe('문제 유형 버전 설정', () => {
  it('준비된 DRAFT 활성화 명령을 전달한다', async () => {
    const onActivate = vi.fn();
    render(
      <QuestionTaxonomySettingsPageView
        data={{
          ...data,
          questionTypes: [
            {
              ...questionType,
              versions: [
                {
                  ...questionTypeVersion,
                  approvedExamples: [
                    {
                      id: '00000000-0000-4000-8000-000000000004',
                      title: '예시',
                      payload: approvedExamplePayload,
                    },
                  ],
                },
              ],
            },
          ],
        }}
        error={false}
        loading={false}
        onActivate={onActivate}
        onArchiveTerm={vi.fn()}
        onCreateTerm={vi.fn()}
        onCreateType={vi.fn()}
        onCreateVersion={vi.fn()}
        onRetry={vi.fn()}
        onRetire={vi.fn()}
        onSaveCriteria={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'v1 활성화' }));

    expect(onActivate).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000002',
    );
  });

  it('vNext의 템플릿·선택지 수·판정 규칙을 편집해 생성한다', async () => {
    const onCreateVersion = vi.fn();
    const user = userEvent.setup();
    render(
      <QuestionTaxonomySettingsPageView
        data={data}
        error={false}
        loading={false}
        onActivate={vi.fn()}
        onArchiveTerm={vi.fn()}
        onCreateTerm={vi.fn()}
        onCreateType={vi.fn()}
        onCreateVersion={onCreateVersion}
        onRetry={vi.fn()}
        onRetire={vi.fn()}
        onSaveCriteria={vi.fn()}
      />,
    );

    screen.getByRole('combobox', { name: 'vNext 템플릿' }).focus();
    await user.keyboard('{Enter}');
    await user.click(
      await screen.findByRole('option', { name: 'DIALOGUE_CHOICE' }),
    );
    screen.getByRole('combobox', { name: 'vNext 선택지 수' }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: '3' }));
    const rules = screen.getByRole('textbox', { name: 'vNext 판정 규칙 JSON' });
    fireEvent.change(rules, { target: { value: '{"mode":"dialogue"}' } });
    await user.click(
      screen.getByRole('button', { name: 'vNext DRAFT 만들기' }),
    );

    expect(onCreateVersion).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      {
        template: 'DIALOGUE_CHOICE',
        optionCount: 3,
        decisionRules: { mode: 'dialogue' },
      },
    );
  });
});

describe('문제 유형 주제와 태그 설정', () => {
  it('주제와 태그를 생성하고 활성 항목을 보관한다', async () => {
    const onArchiveTerm = vi.fn();
    const onCreateTerm = vi.fn();
    const user = userEvent.setup();
    render(
      <QuestionTaxonomySettingsPageView
        data={{
          ...data,
          tags: [
            {
              id: '00000000-0000-4000-8000-000000000006',
              slug: 'formal',
              displayName: '격식',
              status: 'ACTIVE',
            },
          ],
        }}
        error={false}
        loading={false}
        onActivate={vi.fn()}
        onArchiveTerm={onArchiveTerm}
        onCreateTerm={onCreateTerm}
        onCreateType={vi.fn()}
        onCreateVersion={vi.fn()}
        onRetry={vi.fn()}
        onRetire={vi.fn()}
        onSaveCriteria={vi.fn()}
      />,
    );

    const topicSection = screen
      .getByRole('heading', { name: '주제 설정' })
      .closest('section');
    const tagSection = screen
      .getByRole('heading', { name: '태그 설정' })
      .closest('section');
    expect(topicSection).not.toBeNull();
    expect(tagSection).not.toBeNull();
    if (topicSection === null || tagSection === null) return;

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

    expect(onCreateTerm).toHaveBeenNthCalledWith(1, 'topic', {
      slug: 'travel',
      displayName: '여행',
    });
    expect(onCreateTerm).toHaveBeenNthCalledWith(2, 'tag', {
      slug: 'casual',
      displayName: '일상',
    });
    expect(onArchiveTerm).toHaveBeenNthCalledWith(
      1,
      'topic',
      '00000000-0000-4000-8000-000000000003',
    );
    expect(onArchiveTerm).toHaveBeenNthCalledWith(
      2,
      'tag',
      '00000000-0000-4000-8000-000000000006',
    );
  });
});
