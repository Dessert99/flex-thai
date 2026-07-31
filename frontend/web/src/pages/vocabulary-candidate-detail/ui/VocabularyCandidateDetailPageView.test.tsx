/** 어휘 후보 상세 snapshot의 의미 단위 projection을 검증한다 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VocabularyCandidateDetailPageView } from './VocabularyCandidateDetailPageView';

const detail = {
  candidate: {
    id: '00000000-0000-4000-8000-000000000001',
    jobId: '00000000-0000-4000-8000-000000000002',
    jobItemId: '00000000-0000-4000-8000-000000000003',
    jobAttempt: 1,
    ordinal: 0,
    thai: 'สวัสดี',
    kind: 'WORD' as const,
    meanings: [
      { meaningKo: '안녕하세요', partOfSpeech: '감탄사', difficulty: 1 },
    ],
    classification: 'POSSIBLE_DUPLICATE' as const,
    resultGroup: 'NEEDS_ATTENTION' as const,
    matchedVocabularyId: null,
    suspectedMatches: [
      {
        vocabularyId: '00000000-0000-4000-8000-000000000004',
        normalizedThai: 'สวัสดิ',
        codePointDistance: 1,
      },
    ],
    review: { status: 'PENDING' as const, revision: 0, resolution: null },
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  },
  validations: [
    {
      stage: 'SCHEMA' as const,
      status: 'PASSED' as const,
      code: null,
      evidence: {},
      createdAt: '2026-07-31T00:00:01.000Z',
    },
  ],
};

describe('어휘 후보 상세 화면', () => {
  it('추출 snapshot과 validation·중복 후보를 변경 불가능한 정보로 표시한다', () => {
    render(
      <VocabularyCandidateDetailPageView
        data={detail}
        onCreateDraft={vi.fn()}
        onDiscard={vi.fn()}
        onLinkExisting={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'สวัสดี' })).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'DD' &&
          element.textContent === '안녕하세요 · 감탄사 · 난이도 1',
      ),
    ).toBeVisible();
    expect(screen.getByText('POSSIBLE_DUPLICATE')).toBeVisible();
    expect(screen.getByText('SCHEMA')).toBeVisible();
    expect(
      screen.getByText('00000000-0000-4000-8000-000000000004'),
    ).toBeVisible();
    expect(
      screen.queryByText(/provider|private|storage/i),
    ).not.toBeInTheDocument();
  });
});
