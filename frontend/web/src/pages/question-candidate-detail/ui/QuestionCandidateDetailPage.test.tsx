/** 문제 후보 상세의 canonical graph와 redacted 경계를 검증한다 */
import type { QuestionCandidateDetailResponse } from '@flex-thia/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionCandidateDetailPageView } from './QuestionCandidateDetailPageView';

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const sentence = {
  originalText: 'สวัสดีครับ',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디 크랍',
  toneMarks: '',
  tokens: [],
  expressions: [],
};
const summary = {
  id: id(1),
  jobId: id(2),
  jobItemId: id(3),
  jobAttempt: 0,
  ordinal: 0,
  questionTypeVersionId: id(4),
  resultGroup: 'NORMAL' as const,
  review: {
    status: 'PENDING' as const,
    code: null,
    revision: 0,
    regeneratedFromCandidateId: null,
    approvedQuestionId: null,
    approvedQuestionVersionId: null,
  },
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};
const validations = [
  'SCHEMA',
  'DECISION_RULE',
  'SIMILARITY',
  'AI_CROSS_VALIDATION',
].map((stage) => ({
  stage,
  status: 'PASSED' as const,
  code: null,
  evidence: { kind: 'NONE' as const },
  createdAt: '2026-07-28T00:00:00.000Z',
})) as QuestionCandidateDetailResponse['validations'];
const canonical = {
  candidate: {
    ...summary,
    payloadState: 'CANONICAL',
    topicId: id(5),
    difficulty: 3,
    tagIds: [],
    payload: {
      questionTypeSlug: 'dialogue',
      questionTypeVersion: 1,
      difficulty: 3,
      topicSlug: 'daily',
      tagSlugs: [],
      blocks: [
        {
          kind: 'DIALOGUE',
          displayMode: 'TEXT',
          sentences: [{ speaker: 'A', sentence }],
        },
      ],
      options: [
        {
          clientRef: 'answer',
          position: 0,
          sentence,
          span: null,
        },
      ],
      correctOptionRef: 'answer',
    },
  },
  validations,
} satisfies QuestionCandidateDetailResponse;

describe('QuestionCandidateDetailPageView', () => {
  it('canonical Thai 문장과 정확히 네 검증 단계를 표시한다', () => {
    render(
      <QuestionCandidateDetailPageView
        data={canonical}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getAllByText('สวัสดีครับ')).toHaveLength(2);
    expect(screen.getByText('화자: A')).toBeVisible();
    for (const label of ['스키마', '판정 규칙', '유사도', 'AI 교차 검증']) {
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it('redacted 후보에서는 payload graph를 렌더링하지 않는다', () => {
    const redacted: QuestionCandidateDetailResponse = {
      candidate: {
        ...summary,
        payloadState: 'REDACTED_INVALID',
        topicId: null,
        difficulty: null,
        resultGroup: 'FAILED',
        tagIds: [],
        payload: null,
      },
      validations,
    };
    render(
      <QuestionCandidateDetailPageView
        data={redacted}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(
      screen.getByText('후보 payload를 표시할 수 없습니다.'),
    ).toBeVisible();
    expect(screen.queryByText('สวัสดีครับ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '승인' })).toBeDisabled();
  });

  it('검증이 모두 PASSED가 아니면 NORMAL 후보도 승인하지 않는다', () => {
    render(
      <QuestionCandidateDetailPageView
        data={{
          ...canonical,
          validations: canonical.validations.map((validation, index) =>
            index === 0
              ? { ...validation, status: 'FAILED', code: 'INVALID' }
              : validation,
          ),
        }}
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '승인' })).toBeDisabled();
  });
});
