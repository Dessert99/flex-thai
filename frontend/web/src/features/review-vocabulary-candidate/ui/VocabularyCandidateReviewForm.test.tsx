/* eslint-disable max-lines-per-function -- 단일 사용자 흐름에서 graph 입력·mapping·중복 방지를 함께 검증한다. */
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
  it('발음·성조·sealed media와 뜻 연결이 모두 있어야 CREATE_DRAFT를 제출한다', () => {
    const onCreateDraft = vi.fn();
    render(
      <VocabularyCandidateReviewForm
        candidate={candidate}
        onCreateDraft={onCreateDraft}
        onDiscard={vi.fn()}
        onLinkExisting={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('발음 1'), {
      target: { value: '싸왓디' },
    });
    fireEvent.change(screen.getByLabelText('성조 1'), {
      target: { value: 'L-L-M' },
    });
    fireEvent.change(screen.getByLabelText('sealed media asset ID 1'), {
      target: {
        value: '00000000-0000-4000-8000-000000000001',
      },
    });
    expect(
      screen.getByRole('button', { name: '새 DRAFT 승인' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '중복 생성 확인' }));
    fireEvent.click(screen.getByRole('button', { name: '새 DRAFT 승인' }));

    expect(onCreateDraft).toHaveBeenCalledWith({
      action: 'CREATE_DRAFT',
      thai: candidate.thai,
      kind: candidate.kind,
      meanings: [
        {
          clientRef: 'meaning.1',
          ...candidate.meanings[0],
        },
      ],
      pronunciations: [
        {
          clientRef: 'pronunciation.1',
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaAssetId: '00000000-0000-4000-8000-000000000001',
        },
      ],
      meaningPronunciations: [
        { meaningRef: 'meaning.1', pronunciationRef: 'pronunciation.1' },
      ],
      confirmDuplicate: true,
    });
  });

  it('발음 행을 추가·삭제하고 뜻마다 여러 발음을 임의로 연결한다', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '발음 추가' }));
    for (const [label, value] of [
      ['발음 1', '싸왓디'],
      ['성조 1', 'L-L-M'],
      ['sealed media asset ID 1', '00000000-0000-4000-8000-000000000001'],
      ['발음 2', '싸왓'],
      ['성조 2', 'L-L'],
      ['sealed media asset ID 2', '00000000-0000-4000-8000-000000000002'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), {
        target: { value },
      });
    }

    fireEvent.click(
      screen.getByRole('button', {
        name: '뜻 "안녕하세요"에 발음 2 연결',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: '뜻 "안녕"에 발음 1 연결',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: '뜻 "안녕"에 발음 2 연결',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '새 DRAFT 승인' }));

    expect(onCreateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pronunciations: [
          expect.objectContaining({ clientRef: 'pronunciation.1' }),
          expect.objectContaining({ clientRef: 'pronunciation.2' }),
        ],
        meaningPronunciations: [
          { meaningRef: 'meaning.1', pronunciationRef: 'pronunciation.1' },
          { meaningRef: 'meaning.1', pronunciationRef: 'pronunciation.2' },
          { meaningRef: 'meaning.2', pronunciationRef: 'pronunciation.2' },
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '발음 2 삭제' }));
    expect(screen.queryByLabelText('발음 2')).not.toBeInTheDocument();
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
