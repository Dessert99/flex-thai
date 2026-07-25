/** 관리자 DRAFT 어휘의 child graph 전체 교체 RHF를 제공한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminVocabularyReplaceRequest } from '@flex-thia/contracts';
import { useForm } from 'react-hook-form';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { vocabularyFormSchema } from '../model/vocabularyFormSchema';
import { VocabularyMeaningFields } from './VocabularyMeaningFields';
import { VocabularyMeaningPronunciationFields } from './VocabularyMeaningPronunciationFields';
import { VocabularyPronunciationFields } from './VocabularyPronunciationFields';

interface Props {
  defaultValues: AdminVocabularyReplaceRequest;
  disabled: boolean;
  onReplace: (payload: AdminVocabularyReplaceRequest) => void;
}

/** server detail을 Effect 동기화 없이 defaultValues 한 번으로 편집한다 */
export function VocabularyForm({ defaultValues, disabled, onReplace }: Props) {
  const form = useForm<AdminVocabularyReplaceRequest>({
    defaultValues,
    resolver: zodResolver(vocabularyFormSchema),
  });
  return (
    <form
      className='grid gap-section'
      onSubmit={(event) => void form.handleSubmit(onReplace)(event)}
    >
      <div className='grid gap-cluster'>
        <Label htmlFor='vocabulary-thai'>태국어 표기</Label>
        <Input
          className='font-thai'
          id='vocabulary-thai'
          lang='th'
          {...form.register('thai')}
        />
        {form.formState.errors.thai ? (
          <p className='text-body text-danger'>태국어 표기를 입력해 주세요.</p>
        ) : null}
      </div>
      <VocabularyMeaningFields
        count={defaultValues.meanings.length}
        register={form.register}
      />
      <VocabularyPronunciationFields
        count={defaultValues.pronunciations.length}
        register={form.register}
        setValue={form.setValue}
      />
      <VocabularyMeaningPronunciationFields
        count={defaultValues.meaningPronunciations.length}
        register={form.register}
      />
      <Button
        disabled={disabled}
        type='submit'
      >
        어휘 전체 교체
      </Button>
    </form>
  );
}
