/** 어휘 후보 승인 form의 graph 편집과 mutation 방지를 검증한다 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VocabularyCandidateReviewForm } from './VocabularyCandidateReviewForm';

const candidate = {
  thai: 'สวัสดี',
  kind: 'WORD' as const,
  classification: 'POSSIBLE_DUPLICATE' as const,
  meanings: [
    { meaningKo: '안녕하세요', partOfSpeech: '감탄사', difficulty: 1 },
  ],
};

describe('어휘 후보 검수 form', () => {
  it('발음 입력 없이 추출된 뜻으로 초안을 승인한다', () => {
    const onCreateDraft = vi.fn();
    const twoMeaningCandidate = {
      ...candidate,
      classification: 'NEW_VOCABULARY' as const,
      meanings: [
        ...candidate.meanings,
        { meaningKo: '안녕', partOfSpeech: '명사', difficulty: 2 },
      ],
    };
    render(
      <VocabularyCandidateReviewForm
        candidate={twoMeaningCandidate}
        onCreateDraft={onCreateDraft}
        onDiscard={vi.fn()}
        onLinkExisting={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/발음|성조/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '새 DRAFT 승인' }));
    expect(onCreateDraft).toHaveBeenCalledWith({
      action: 'CREATE_DRAFT',
      thai: candidate.thai,
      kind: candidate.kind,
      meanings: twoMeaningCandidate.meanings.map((meaning, index) => ({
        ...meaning,
        clientRef: `meaning.${index + 1}`,
      })),
    });
  });

  it('mutation 중에는 create·link·discard 중복 실행을 모두 막는다', () => {
    render(
      <VocabularyCandidateReviewForm
        candidate={{ ...candidate, classification: 'NEW_VOCABULARY' }}
        onCreateDraft={vi.fn()}
        onDiscard={vi.fn()}
        onLinkExisting={vi.fn()}
        pending
      />,
    );

    expect(
      screen.getByRole('button', { name: '새 DRAFT 승인' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '기존 어휘 연결' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '후보 폐기' })).toBeDisabled();
  });
});
