import { Button } from '@/shared/components/button';
import type { VocabularyCandidateListResponse } from '@flex-thia/contracts/content-production/vocabulary-candidates';
import { useState } from 'react';
import type { VocabularyCandidateApprovalInput } from '../../apis/review-vocabulary-candidate/vocabularyCandidateApi';

type VocabularyCandidate = VocabularyCandidateListResponse['items'][number];
type CreateDraftInput = Extract<
  VocabularyCandidateApprovalInput,
  { action: 'CREATE_DRAFT' }
>;
type CandidateSnapshot = Pick<
  VocabularyCandidate,
  'classification' | 'kind' | 'meanings' | 'thai'
>;

/** 새 DRAFT graph 편집에 필요한 후보 snapshot과 승인 callback */
export interface VocabularyCandidateDraftFormProps {
  candidate: CandidateSnapshot;
  pending: boolean;
  onCreateDraft: (input: CreateDraftInput) => void;
}

/** 후보의 뜻을 검토해 초안 생성을 승인한다. */
export function VocabularyCandidateDraftForm({
  candidate,
  pending,
  onCreateDraft,
}: VocabularyCandidateDraftFormProps) {
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const duplicateConfirmationRequired =
    candidate.classification !== 'NEW_VOCABULARY';
  const disabled =
    pending ||
    candidate.meanings.length === 0 ||
    (duplicateConfirmationRequired && !confirmDuplicate);
  return (
    <form
      className='grid gap-cluster'
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        onCreateDraft({
          action: 'CREATE_DRAFT',
          thai: candidate.thai,
          kind: candidate.kind,
          meanings: candidate.meanings.map((meaning, index) => ({
            ...meaning,
            clientRef: `meaning.${index + 1}`,
          })),
          ...(duplicateConfirmationRequired
            ? { confirmDuplicate: true as const }
            : {}),
        });
      }}
    >
      <h2 className='text-heading text-primary'>새 어휘 초안</h2>
      <p lang='th'>{candidate.thai}</p>
      <ul>
        {candidate.meanings.map((meaning, index) => (
          <li key={index}>
            {meaning.meaningKo} · {meaning.partOfSpeech} · 난이도{' '}
            {meaning.difficulty}
          </li>
        ))}
      </ul>
      {duplicateConfirmationRequired ? (
        <Button
          aria-pressed={confirmDuplicate}
          disabled={pending}
          onClick={() => setConfirmDuplicate((current) => !current)}
          type='button'
          variant='outline'
        >
          중복 생성 확인
        </Button>
      ) : null}
      <Button
        disabled={disabled}
        type='submit'
      >
        새 DRAFT 승인
      </Button>
    </form>
  );
}
