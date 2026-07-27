/** 관리자 문제 분류 설정 화면 동작을 검증한다 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionTaxonomySettingsPageView } from './QuestionTaxonomySettingsPageView';

const data = {
  questionTypes: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'reading-vocabulary',
      displayName: '어휘·문법',
      majorCategory: 'READING_VOCABULARY_GRAMMAR',
      versions: [
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
          approvedExamples: [],
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
  tags: [],
} as const;

describe('QuestionTaxonomySettingsPageView', () => {
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

    expect(screen.getByRole('heading', { name: '문제 유형 설정' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '반응 테스트' }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('heading', { name: '어휘·문법' }),
    ).toHaveLength(2);
    expect(screen.getByText('승인 예시가 필요합니다.')).toBeVisible();
  });

  it('준비된 DRAFT 활성화 명령을 전달한다', async () => {
    const onActivate = vi.fn();
    render(
      <QuestionTaxonomySettingsPageView
        data={{
          ...data,
          questionTypes: [
            {
              ...data.questionTypes[0],
              versions: [
                {
                  ...data.questionTypes[0].versions[0],
                  approvedExamples: [
                    {
                      id: '00000000-0000-4000-8000-000000000004',
                      title: '예시',
                      payload: {},
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
});
