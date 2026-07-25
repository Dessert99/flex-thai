/** 문제 상태 command의 확인·409·confirmed event 수명을 관리한다 */
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import {
  changeQuestionState,
  type QuestionStateCommand,
} from '../api/questionStateMutations';

interface QuestionStateActionProps {
  command: QuestionStateCommand;
  onConfirmed: (command: QuestionStateCommand) => void;
}

/** destructive command는 확인 뒤, restore는 명시 버튼 클릭 뒤에만 전송한다 */
export function QuestionStateAction({
  command,
  onConfirmed,
}: QuestionStateActionProps) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: changeQuestionState,
    onSuccess: (_result, confirmed) => {
      setOpen(false);
      onConfirmed(confirmed);
    },
    retry: false,
  });
  const labels = actionLabels[command.action];

  return (
    <div className='grid gap-cluster'>
      {command.action === 'restore' ? (
        <Button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(command)}
          type='button'
          variant='outline'
        >
          {labels.trigger}
        </Button>
      ) : (
        <Dialog
          onOpenChange={setOpen}
          open={open}
        >
          <DialogTrigger asChild>
            <Button
              disabled={mutation.isPending}
              type='button'
              variant='outline'
            >
              {labels.trigger}
            </Button>
          </DialogTrigger>
          <DialogContent className='bg-surface'>
            <DialogHeader>
              <DialogTitle>{labels.title}</DialogTitle>
              <DialogDescription>
                서버가 현재 상태를 다시 확인한 뒤 작업을 수행합니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type='button'
                  variant='outline'
                >
                  취소
                </Button>
              </DialogClose>
              <Button
                disabled={mutation.isPending}
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
            : '문제 상태를 변경하지 못했습니다.'}
        </p>
      ) : null}
    </div>
  );
}

const actionLabels = {
  hide: {
    confirm: '숨기기 확인',
    title: '문제를 숨길까요?',
    trigger: '문제 숨기기',
  },
  invalidate: {
    confirm: '무효화 확인',
    title: '게시 버전을 무효화할까요?',
    trigger: '버전 무효화',
  },
  publish: {
    confirm: '게시 확인',
    title: 'DRAFT 버전을 게시할까요?',
    trigger: '버전 게시',
  },
  restore: {
    confirm: '복구',
    title: '문제 복구',
    trigger: '문제 복구',
  },
} as const;

function isConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.status === 409
  );
}
