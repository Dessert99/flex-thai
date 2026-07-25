/** 관리자 어휘 뜻 배열을 RHF 순서 그대로 편집한다 */
import type { AdminVocabularyReplaceRequest } from '@flex-thia/contracts';
import type { UseFormRegister } from 'react-hook-form';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

/** 뜻의 nullable 필드를 빈 문자열 UI로 표현한다 */
export function VocabularyMeaningFields({
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
      <legend>뜻 {index + 1}</legend>
      <Label htmlFor={`meaning-${index}`}>한국어 뜻</Label>
      <Input
        id={`meaning-${index}`}
        {...register(`meanings.${index}.meaningKo`)}
      />
      <Label htmlFor={`part-${index}`}>품사</Label>
      <Input
        id={`part-${index}`}
        {...register(`meanings.${index}.partOfSpeech`)}
      />
    </fieldset>
  ));
}
