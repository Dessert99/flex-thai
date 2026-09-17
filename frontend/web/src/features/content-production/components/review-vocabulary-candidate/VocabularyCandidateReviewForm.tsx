/** 어휘 후보를 완전한 DRAFT graph 또는 기존 어휘 연결로 검수한다 */
import { useState } from 'react';
import type { VocabularyCandidateListResponse } from '@flex-thia/contracts/content-production/vocabulary-candidates';
import { z } from 'zod';
import type { VocabularyCandidateApprovalInput } from '../../apis/review-vocabulary-candidate/vocabularyCandidateApi';
import { VocabularyCandidateDraftForm } from './VocabularyCandidateDraftForm';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';

type VocabularyCandidate = VocabularyCandidateListResponse['items'][number];
type CreateDraftInput = Extract<
  VocabularyCandidateApprovalInput,
  { action: 'CREATE_DRAFT' }
>;

export interface VocabularyCandidateReviewFormProps {
  candidate: Pick<
    VocabularyCandidate,
    'classification' | 'kind' | 'meanings' | 'thai'
  >;
  pending?: boolean;
  onCreateDraft: (input: CreateDraftInput) => void;
  onDiscard: () => void;
  onLinkExisting: (vocabularyId: string) => void;
}

const uuidSchema = z.uuid();

function LinkExistingForm({
  pending,
  onLinkExisting,
}: Pick<VocabularyCandidateReviewFormProps, 'onLinkExisting'> & {
  pending: boolean;
}) {
  const [vocabularyId, setVocabularyId] = useState('');
  const valid = uuidSchema.safeParse(vocabularyId).success;
  return (
    <form
      className='grid gap-cluster'
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && valid) onLinkExisting(vocabularyId);
      }}
    >
      <h2 className='text-heading text-primary'>기존 어휘 연결</h2>
      <Label htmlFor='existing-vocabulary-id'>기존 어휘 ID</Label>
      <Input
        disabled={pending}
        id='existing-vocabulary-id'
        onChange={(event) => setVocabularyId(event.target.value)}
        value={vocabularyId}
      />
      <Button
        disabled={pending || !valid}
        type='submit'
        variant='outline'
      >
        기존 어휘 연결
      </Button>
    </form>
  );
}

export function VocabularyCandidateReviewForm({
  candidate,
  pending = false,
  onCreateDraft,
  onDiscard,
  onLinkExisting,
}: VocabularyCandidateReviewFormProps) {
  return (
    <div className='grid gap-section'>
      <VocabularyCandidateDraftForm
        candidate={candidate}
        onCreateDraft={onCreateDraft}
        pending={pending}
      />
      <LinkExistingForm
        onLinkExisting={onLinkExisting}
        pending={pending}
      />
      <Button
        disabled={pending}
        onClick={onDiscard}
        type='button'
        variant='destructive'
      >
        후보 폐기
      </Button>
    </div>
  );
}
