/** 관리자 어휘 발음 배열과 READY audio ID를 RHF에 연결한다 */
import type { AdminVocabularyReplaceRequest } from '@flex-thia/contracts';
import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { AudioUploadField } from '@/features/upload-audio';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

/** 기존 media ID 표시와 새 READY ID 교체를 발음 field에 한정한다 */
export function VocabularyPronunciationFields({
  count,
  register,
  setValue,
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
      <AudioUploadField
        onReady={(mediaAssetId) =>
          setValue(`pronunciations.${index}.mediaAssetId`, mediaAssetId)
        }
      />
    </fieldset>
  ));
}
