/** 서버가 확정한 뒤에만 문제 저장 상태를 바꾼다 */
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { changeSavedQuestion } from '../api/savedQuestionMutation';

interface SavedQuestionButtonProps {
  onConfirmed: (saved: boolean) => void;
  questionId: string;
  saved: boolean;
}

/** optimistic update 없이 저장·해제 결과를 Page에 알린다 */
export function SavedQuestionButton({
  onConfirmed,
  questionId,
  saved,
}: SavedQuestionButtonProps) {
  const [confirmedSaved, setConfirmedSaved] = useState(saved);
  const mutation = useMutation({
    mutationFn: () => changeSavedQuestion(questionId, confirmedSaved),
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
        onClick={() => {
          mutation.mutate();
        }}
        type='button'
        variant='outline'
      >
        {confirmedSaved ? '문제 저장 해제' : '문제 저장'}
      </Button>
      {mutation.isError ? (
        <p className='text-body text-danger'>
          저장 상태를 바꾸지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  );
}
