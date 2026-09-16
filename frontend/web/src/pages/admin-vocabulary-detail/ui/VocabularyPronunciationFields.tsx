import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { AdminVocabularyReplaceRequest } from '@flex-thia/contracts';
import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';

export function VocabularyPronunciationFields({
  count,
  register,
}: {
  count: number;
  register: UseFormRegister<AdminVocabularyReplaceRequest>;
  setValue: UseFormSetValue<AdminVocabularyReplaceRequest>;
}) {
  return Array.from({ length: count }, (_, index) => (
    <fieldset
      className='grid gap-cluster rounded-control border border-default p-cluster'
      key={index}
    >
      <legend>발음 {index + 1}</legend>
      <Label htmlFor={`pronunciation-${index}`}>한국어 발음</Label>
      <Input
        id={`pronunciation-${index}`}
        {...register(`pronunciations.${index}.pronunciationKo`)}
      />
      <Label htmlFor={`tone-${index}`}>성조 표기</Label>
      <Input
        id={`tone-${index}`}
        {...register(`pronunciations.${index}.toneMarks`)}
      />
    </fieldset>
  ));
}
