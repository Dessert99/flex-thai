/** 문제 유형 버전의 기준·승인 예시·상태 전이 사용자 행동을 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  AdminQuestionVersionPayload,
  QuestionTaxonomySettingsResponse,
} from '@flex-thia/contracts';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionTypeVersionEditor } from './QuestionTypeVersionEditor';

type QuestionTypeVersion =
  QuestionTaxonomySettingsResponse['questionTypes'][number]['versions'][number];
type EditorProps = ComponentProps<typeof QuestionTypeVersionEditor>;

const versionId = '00000000-0000-4000-8000-000000000002';
const sentence = {
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
      sentences: [{ speaker: null, sentence }],
    },
  ],
  options: ['a', 'b', 'c', 'd'].map((clientRef, position) => ({
    clientRef,
    position,
    sentence,
    span: null,
  })),
  correctOptionRef: 'a',
} satisfies AdminQuestionVersionPayload;

const draftVersion = {
  id: versionId,
  version: 1,
  status: 'DRAFT',
  template: 'STANDARD_CHOICE',
  optionCount: 4,
  decisionRules: {},
  difficultyCriteria: [1, 2, 3, 4, 5].map((difficulty) => ({
    difficulty,
    criteria: `${difficulty}단계`,
  })),
  approvedExamples: [],
} satisfies QuestionTypeVersion;

describe('문제 유형 버전 난이도 기준', () => {
  it('난이도 입력을 수정해 1~5 기준 전체를 저장한다', async () => {
    const onSaveCriteria = vi.fn<EditorProps['onSaveCriteria']>();
    const user = userEvent.setup();
    renderVersionEditor({ onSaveCriteria });

    const difficultyThree = screen.getByLabelText('난이도 3');
    await user.clear(difficultyThree);
    await user.type(difficultyThree, '새 3단계 기준');
    await user.click(screen.getByRole('button', { name: '난이도 기준 저장' }));

    expect(onSaveCriteria).toHaveBeenCalledWith(versionId, {
      criteria: [
        { difficulty: 1, criteria: '1단계' },
        { difficulty: 2, criteria: '2단계' },
        { difficulty: 3, criteria: '새 3단계 기준' },
        { difficulty: 4, criteria: '4단계' },
        { difficulty: 5, criteria: '5단계' },
      ],
    });
  });
});

describe('문제 유형 버전 승인 예시', () => {
  it('이름과 canonical JSON을 입력해 승인 예시를 추가한다', async () => {
    const onAddExample = vi.fn<NonNullable<EditorProps['onAddExample']>>();
    const user = userEvent.setup();
    renderVersionEditor({ onAddExample });

    await user.type(
      screen.getByLabelText('v1 승인 예시 이름'),
      '기본 승인 예시',
    );
    fireEvent.change(screen.getByLabelText('v1 승인 예시 JSON'), {
      target: { value: JSON.stringify(approvedExamplePayload) },
    });
    await user.click(screen.getByRole('button', { name: '승인 예시 추가' }));

    expect(onAddExample).toHaveBeenCalledWith(versionId, {
      title: '기본 승인 예시',
      payload: approvedExamplePayload,
    });
  });
});

describe('문제 유형 버전 상태 전이', () => {
  it('ACTIVE 버전의 사용을 종료한다', async () => {
    const onRetire = vi.fn<EditorProps['onRetire']>();
    const user = userEvent.setup();
    renderVersionEditor({
      onRetire,
      version: { ...draftVersion, status: 'ACTIVE' },
    });

    await user.click(screen.getByRole('button', { name: 'v1 사용 종료' }));

    expect(onRetire).toHaveBeenCalledWith(versionId);
  });
});

function renderVersionEditor({
  onAddExample = vi.fn(),
  onRetire = vi.fn(),
  onSaveCriteria = vi.fn(),
  version = draftVersion,
}: {
  onAddExample?: NonNullable<EditorProps['onAddExample']>;
  onRetire?: EditorProps['onRetire'];
  onSaveCriteria?: EditorProps['onSaveCriteria'];
  version?: QuestionTypeVersion;
}) {
  return render(
    <QuestionTypeVersionEditor
      onActivate={vi.fn()}
      onAddExample={onAddExample}
      onRetire={onRetire}
      onSaveCriteria={onSaveCriteria}
      version={version}
    />,
  );
}
