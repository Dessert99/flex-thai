/** 어휘 후보를 완전한 DRAFT graph 또는 기존 어휘 연결로 검수한다 */
import { useState, type FormEvent } from 'react';
import type { VocabularyCandidateListResponse } from '@flex-thia/contracts';
import { z } from 'zod';
import type { VocabularyCandidateApprovalInput } from '../api/vocabularyCandidateApi';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

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
type CandidateSnapshot = VocabularyCandidateReviewFormProps['candidate'];
type PronunciationInput = {
  mediaAssetId: string;
  pronunciationKo: string;
  toneMarks: string;
};

function toCreateDraftInput(
  candidate: CandidateSnapshot,
  pronunciations: PronunciationInput[],
  duplicateConfirmationRequired: boolean,
): CreateDraftInput {
  return {
    action: 'CREATE_DRAFT',
    thai: candidate.thai,
    kind: candidate.kind,
    meanings: candidate.meanings.map((meaning, index) => ({
      clientRef: `meaning.${index + 1}`,
      ...meaning,
    })),
    pronunciations: pronunciations.map((pronunciation, index) => ({
      clientRef: `pronunciation.${index + 1}`,
      pronunciationKo: pronunciation.pronunciationKo.trim(),
      toneMarks: pronunciation.toneMarks.trim(),
      mediaAssetId: pronunciation.mediaAssetId,
    })),
    meaningPronunciations: candidate.meanings.map((_, index) => ({
      meaningRef: `meaning.${index + 1}`,
      pronunciationRef: `pronunciation.${index + 1}`,
    })),
    ...(duplicateConfirmationRequired ? { confirmDuplicate: true } : {}),
  };
}

function PronunciationFields({
  index,
  meaningKo,
  pending,
  pronunciation,
  onChange,
}: {
  index: number;
  meaningKo: string;
  pending: boolean;
  pronunciation: PronunciationInput;
  onChange: (field: keyof PronunciationInput, value: string) => void;
}) {
  const suffix = index + 1;
  return (
    <fieldset className='grid gap-cluster rounded-control border border-default p-cluster'>
      <legend className='text-label text-primary'>{meaningKo}</legend>
      <Label htmlFor={`pronunciation-${suffix}`}>발음 {suffix}</Label>
      <Input
        disabled={pending}
        id={`pronunciation-${suffix}`}
        onChange={(event) => onChange('pronunciationKo', event.target.value)}
        value={pronunciation.pronunciationKo}
      />
      <Label htmlFor={`tone-marks-${suffix}`}>성조 {suffix}</Label>
      <Input
        disabled={pending}
        id={`tone-marks-${suffix}`}
        onChange={(event) => onChange('toneMarks', event.target.value)}
        value={pronunciation.toneMarks}
      />
      <Label htmlFor={`media-asset-${suffix}`}>
        sealed media asset ID {suffix}
      </Label>
      <Input
        disabled={pending}
        id={`media-asset-${suffix}`}
        onChange={(event) => onChange('mediaAssetId', event.target.value)}
        value={pronunciation.mediaAssetId}
      />
    </fieldset>
  );
}

function CreateDraftForm({
  candidate,
  pending,
  onCreateDraft,
}: Pick<VocabularyCandidateReviewFormProps, 'candidate' | 'onCreateDraft'> & {
  pending: boolean;
}) {
  const [pronunciations, setPronunciations] = useState(() =>
    candidate.meanings.map(() => ({
      mediaAssetId: '',
      pronunciationKo: '',
      toneMarks: '',
    })),
  );
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const duplicateConfirmationRequired =
    candidate.classification !== 'NEW_VOCABULARY';
  const graphComplete = pronunciations.every(
    ({ mediaAssetId, pronunciationKo, toneMarks }) =>
      pronunciationKo.trim().length > 0 &&
      toneMarks.trim().length > 0 &&
      uuidSchema.safeParse(mediaAssetId).success,
  );
  const createDisabled =
    pending ||
    !graphComplete ||
    (duplicateConfirmationRequired && !confirmDuplicate);
  const updatePronunciation = (
    index: number,
    field: 'mediaAssetId' | 'pronunciationKo' | 'toneMarks',
    value: string,
  ) => {
    setPronunciations((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };
  const submitCreateDraft = (event: FormEvent) => {
    event.preventDefault();
    if (createDisabled) return;
    onCreateDraft(
      toCreateDraftInput(
        candidate,
        pronunciations,
        duplicateConfirmationRequired,
      ),
    );
  };
  return (
    <form
      className='grid gap-cluster'
      onSubmit={submitCreateDraft}
    >
      <h2 className='text-heading text-primary'>새 DRAFT 생성</h2>
      {candidate.meanings.map((meaning, index) => (
        <PronunciationFields
          index={index}
          key={`meaning.${index + 1}`}
          meaningKo={meaning.meaningKo}
          onChange={(field, value) => updatePronunciation(index, field, value)}
          pending={pending}
          pronunciation={
            pronunciations[index] ?? {
              mediaAssetId: '',
              pronunciationKo: '',
              toneMarks: '',
            }
          }
        />
      ))}
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
        disabled={createDisabled}
        type='submit'
      >
        새 DRAFT 승인
      </Button>
    </form>
  );
}

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

/** 후보 snapshot을 보존하고 사람이 입력한 발음·sealed media만 DRAFT graph에 보완한다 */
export function VocabularyCandidateReviewForm({
  candidate,
  pending = false,
  onCreateDraft,
  onDiscard,
  onLinkExisting,
}: VocabularyCandidateReviewFormProps) {
  return (
    <div className='grid gap-section'>
      <CreateDraftForm
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
