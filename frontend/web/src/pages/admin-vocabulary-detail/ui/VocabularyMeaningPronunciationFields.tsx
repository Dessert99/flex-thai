/** 뜻·발음 request-local ref mapping을 RHF 배열로 편집한다 */
import type { AdminVocabularyReplaceRequest } from '@flex-thia/contracts';
import type { UseFormRegister } from 'react-hook-form';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

/** response ID를 undocumented field가 아닌 공개 ref 입력으로 유지한다 */
export function VocabularyMeaningPronunciationFields({
  count,
  register,
}: {
  count: number;
  register: UseFormRegister<AdminVocabularyReplaceRequest>;
}) {
  return Array.from({ length: count }, (_, index) => (
    <fieldset
      className='grid gap-cluster rounded-control border border-default p-cluster'
      key={index}
    >
      <legend>뜻·발음 연결 {index + 1}</legend>
      <Label htmlFor={`meaning-ref-${index}`}>뜻 ref</Label>
      <Input
        id={`meaning-ref-${index}`}
        {...register(`meaningPronunciations.${index}.meaningRef`)}
      />
      <Label htmlFor={`pronunciation-ref-${index}`}>발음 ref</Label>
      <Input
        id={`pronunciation-ref-${index}`}
        {...register(`meaningPronunciations.${index}.pronunciationRef`)}
      />
    </fieldset>
  ));
}
