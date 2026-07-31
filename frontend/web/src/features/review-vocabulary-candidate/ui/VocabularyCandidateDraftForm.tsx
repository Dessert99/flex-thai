/** 어휘 후보의 발음 행과 뜻-발음 graph를 편집해 새 DRAFT 승인을 만든다 */
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
type CandidateSnapshot = Pick<
  VocabularyCandidate,
  'classification' | 'kind' | 'meanings' | 'thai'
>;
type PronunciationInput = {
  id: number;
  mediaAssetId: string;
  pronunciationKo: string;
  toneMarks: string;
};

/** 새 DRAFT graph 편집에 필요한 후보 snapshot과 승인 callback */
export interface VocabularyCandidateDraftFormProps {
  candidate: CandidateSnapshot;
  pending: boolean;
  onCreateDraft: (input: CreateDraftInput) => void;
}

const uuidSchema = z.uuid();
const emptyPronunciation = (id: number): PronunciationInput => ({
  id,
  mediaAssetId: '',
  pronunciationKo: '',
  toneMarks: '',
});
const mappingKey = (meaningIndex: number, pronunciationId: number) =>
  `${meaningIndex}:${pronunciationId}`;

const toCreateDraftInput = (
  candidate: CandidateSnapshot,
  pronunciations: PronunciationInput[],
  mappings: Set<string>,
  duplicateConfirmationRequired: boolean,
): CreateDraftInput => ({
  action: 'CREATE_DRAFT',
  thai: candidate.thai,
  kind: candidate.kind,
  meanings: candidate.meanings.map((meaning, index) => ({
    clientRef: `meaning.${index + 1}`,
    ...meaning,
  })),
  pronunciations: pronunciations.map((pronunciation) => ({
    clientRef: `pronunciation.${pronunciation.id}`,
    pronunciationKo: pronunciation.pronunciationKo.trim(),
    toneMarks: pronunciation.toneMarks.trim(),
    mediaAssetId: pronunciation.mediaAssetId,
  })),
  meaningPronunciations: candidate.meanings.flatMap((_, meaningIndex) =>
    pronunciations
      .filter(({ id }) => mappings.has(mappingKey(meaningIndex, id)))
      .map(({ id }) => ({
        meaningRef: `meaning.${meaningIndex + 1}`,
        pronunciationRef: `pronunciation.${id}`,
      })),
  ),
  ...(duplicateConfirmationRequired ? { confirmDuplicate: true } : {}),
});

function PronunciationFields({
  index,
  pending,
  pronunciation,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  pending: boolean;
  pronunciation: PronunciationInput;
  removable: boolean;
  onChange: (
    field: keyof Omit<PronunciationInput, 'id'>,
    value: string,
  ) => void;
  onRemove: () => void;
}) {
  const suffix = index + 1;
  return (
    <fieldset className='grid gap-cluster rounded-control border border-default p-cluster'>
      <legend className='text-label text-primary'>발음 {suffix}</legend>
      <Label htmlFor={`pronunciation-${pronunciation.id}`}>발음 {suffix}</Label>
      <Input
        disabled={pending}
        id={`pronunciation-${pronunciation.id}`}
        onChange={(event) => onChange('pronunciationKo', event.target.value)}
        value={pronunciation.pronunciationKo}
      />
      <Label htmlFor={`tone-marks-${pronunciation.id}`}>성조 {suffix}</Label>
      <Input
        disabled={pending}
        id={`tone-marks-${pronunciation.id}`}
        onChange={(event) => onChange('toneMarks', event.target.value)}
        value={pronunciation.toneMarks}
      />
      <Label htmlFor={`media-asset-${pronunciation.id}`}>
        sealed media asset ID {suffix}
      </Label>
      <Input
        disabled={pending}
        id={`media-asset-${pronunciation.id}`}
        onChange={(event) => onChange('mediaAssetId', event.target.value)}
        value={pronunciation.mediaAssetId}
      />
      <Button
        disabled={pending || !removable}
        onClick={onRemove}
        type='button'
        variant='outline'
      >
        발음 {suffix} 삭제
      </Button>
    </fieldset>
  );
}

const useDraftGraph = ({
  candidate,
  pending,
  onCreateDraft,
}: VocabularyCandidateDraftFormProps) => {
  const [pronunciations, setPronunciations] = useState(() => [
    emptyPronunciation(1),
  ]);
  const [mappings, setMappings] = useState(
    () =>
      new Set(
        candidate.meanings.map((_, meaningIndex) =>
          mappingKey(meaningIndex, 1),
        ),
      ),
  );
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const duplicateConfirmationRequired =
    candidate.classification !== 'NEW_VOCABULARY';
  const graphComplete =
    pronunciations.every(
      ({ mediaAssetId, pronunciationKo, toneMarks }) =>
        pronunciationKo.trim().length > 0 &&
        toneMarks.trim().length > 0 &&
        uuidSchema.safeParse(mediaAssetId).success,
    ) &&
    candidate.meanings.every((_, meaningIndex) =>
      pronunciations.some(({ id }) =>
        mappings.has(mappingKey(meaningIndex, id)),
      ),
    ) &&
    pronunciations.every(({ id }) =>
      candidate.meanings.some((_, meaningIndex) =>
        mappings.has(mappingKey(meaningIndex, id)),
      ),
    );
  const createDisabled =
    pending ||
    !graphComplete ||
    (duplicateConfirmationRequired && !confirmDuplicate);

  const updatePronunciation = (
    id: number,
    field: keyof Omit<PronunciationInput, 'id'>,
    value: string,
  ) => {
    setPronunciations((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };
  const removePronunciation = (id: number) => {
    setPronunciations((current) => current.filter((item) => item.id !== id));
    setMappings(
      (current) =>
        new Set([...current].filter((mapping) => !mapping.endsWith(`:${id}`))),
    );
  };
  const toggleMapping = (meaningIndex: number, pronunciationId: number) => {
    const key = mappingKey(meaningIndex, pronunciationId);
    setMappings((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const submitCreateDraft = (event: FormEvent) => {
    event.preventDefault();
    if (createDisabled) return;
    onCreateDraft(
      toCreateDraftInput(
        candidate,
        pronunciations,
        mappings,
        duplicateConfirmationRequired,
      ),
    );
  };
  const addPronunciation = () => {
    setPronunciations((current) => [
      ...current,
      emptyPronunciation(Math.max(...current.map(({ id }) => id)) + 1),
    ]);
  };

  return {
    addPronunciation,
    confirmDuplicate,
    createDisabled,
    duplicateConfirmationRequired,
    mappings,
    pronunciations,
    removePronunciation,
    setConfirmDuplicate,
    submitCreateDraft,
    toggleMapping,
    updatePronunciation,
  };
};

/** 모든 뜻과 발음이 최소 한 번 연결된 many-to-many graph만 제출한다 */
export function VocabularyCandidateDraftForm(
  props: VocabularyCandidateDraftFormProps,
) {
  const { candidate, pending } = props;
  const editor = useDraftGraph(props);

  return (
    <form
      className='grid gap-cluster'
      onSubmit={editor.submitCreateDraft}
    >
      <h2 className='text-heading text-primary'>새 DRAFT 생성</h2>
      {editor.pronunciations.map((pronunciation, index) => (
        <PronunciationFields
          index={index}
          key={pronunciation.id}
          onChange={(field, value) =>
            editor.updatePronunciation(pronunciation.id, field, value)
          }
          onRemove={() => editor.removePronunciation(pronunciation.id)}
          pending={pending}
          pronunciation={pronunciation}
          removable={editor.pronunciations.length > 1}
        />
      ))}
      <Button
        disabled={pending}
        onClick={editor.addPronunciation}
        type='button'
        variant='outline'
      >
        발음 추가
      </Button>
      <fieldset className='grid gap-cluster rounded-control border border-default p-cluster'>
        <legend className='text-label text-primary'>뜻·발음 연결</legend>
        {candidate.meanings.flatMap((meaning, meaningIndex) =>
          editor.pronunciations.map((pronunciation, pronunciationIndex) => {
            const key = mappingKey(meaningIndex, pronunciation.id);
            return (
              <Button
                aria-pressed={editor.mappings.has(key)}
                disabled={pending}
                key={key}
                onClick={() =>
                  editor.toggleMapping(meaningIndex, pronunciation.id)
                }
                type='button'
                variant='outline'
              >
                뜻 &quot;{meaning.meaningKo}&quot;에 발음{' '}
                {pronunciationIndex + 1} 연결
              </Button>
            );
          }),
        )}
      </fieldset>
      {editor.duplicateConfirmationRequired ? (
        <Button
          aria-pressed={editor.confirmDuplicate}
          disabled={pending}
          onClick={() => editor.setConfirmDuplicate((current) => !current)}
          type='button'
          variant='outline'
        >
          중복 생성 확인
        </Button>
      ) : null}
      <Button
        disabled={editor.createDisabled}
        type='submit'
      >
        새 DRAFT 승인
      </Button>
    </form>
  );
}
