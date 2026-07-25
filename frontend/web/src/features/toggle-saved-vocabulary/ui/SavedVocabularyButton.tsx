/** 서버 확정 뒤에만 어휘 저장 상태를 바꾼다 */
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { changeSavedVocabulary } from '../api/savedVocabularyMutation';

interface SavedVocabularyButtonProps {
  onConfirmed: (saved: boolean) => void;
  saved: boolean;
  vocabularyId: string;
}

/** optimistic update 없이 저장·해제 결과를 Page에 알린다 */
export function SavedVocabularyButton({
  onConfirmed,
  saved,
  vocabularyId,
}: SavedVocabularyButtonProps) {
  const [confirmedSaved, setConfirmedSaved] = useState(saved);
  const mutation = useMutation({
    mutationFn: () => changeSavedVocabulary(vocabularyId, confirmedSaved),
    retry: false,
    onSuccess: (nextSaved) => {
      setConfirmedSaved(nextSaved);
      onConfirmed(nextSaved);
    },
  });

  return (
    <div className='grid gap-cluster'>
      <Button
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        type='button'
        variant='outline'
      >
        {confirmedSaved ? '어휘 저장 해제' : '어휘 저장'}
      </Button>
      {mutation.isError ? (
        <p className='text-body text-danger'>저장 상태를 바꾸지 못했습니다.</p>
      ) : null}
    </div>
  );
}
