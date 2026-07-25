/** 어휘 상태 action의 confirmation·409·confirmed event를 관리한다 */
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import {
  changeVocabularyState,
  type VocabularyStateActionKind,
} from '../api/vocabularyStateMutations';

interface Props {
  action: VocabularyStateActionKind;
  onConfirmed: (event: {
    action: VocabularyStateActionKind;
    vocabularyId: string;
  }) => void;
  vocabularyId: string;
}

/** publish/hide는 Dialog 확인 후, restore는 명시 클릭 후 전송한다 */
export function VocabularyStateAction({
  action,
  onConfirmed,
  vocabularyId,
}: Props) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: changeVocabularyState,
    onSuccess: (_data, command) => {
      setOpen(false);
      onConfirmed(command);
    },
    retry: false,
  });
  const command = { action, vocabularyId };
  const labels = actionLabels[action];
  const trigger = (
    <Button
      disabled={mutation.isPending}
      onClick={
        action === 'restore' ? () => mutation.mutate(command) : undefined
      }
      type='button'
      variant='outline'
    >
      {labels.trigger}
    </Button>
  );
  return (
    <div className='grid gap-cluster'>
      {action === 'restore' ? (
        trigger
      ) : (
        <Dialog
          open={open}
          onOpenChange={setOpen}
        >
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent className='bg-surface'>
            <DialogHeader>
              <DialogTitle>{labels.title}</DialogTitle>
              <DialogDescription>
                서버가 게시 prerequisite와 현재 상태를 확인합니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => mutation.mutate(command)}
                type='button'
              >
                {labels.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {mutation.isError ? (
        <p className='text-body text-danger'>
          {isConflict(mutation.error)
            ? '현재 상태에서는 이 작업을 수행할 수 없습니다.'
            : '어휘 상태를 변경하지 못했습니다.'}
        </p>
      ) : null}
    </div>
  );
}

const actionLabels = {
  hide: {
    trigger: '어휘 숨기기',
    confirm: '숨기기 확인',
    title: '어휘를 숨길까요?',
  },
  publish: {
    trigger: '어휘 게시',
    confirm: '게시 확인',
    title: '어휘를 게시할까요?',
  },
  restore: { trigger: '어휘 복구', confirm: '복구', title: '어휘 복구' },
} as const;

function isConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.status === 409
  );
}
