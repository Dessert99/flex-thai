/** 단어장 이름 변경과 확인 삭제 Dialog를 제공한다 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
import { deleteWordbook } from '../api/wordbookMutations';
import { WordbookForm } from './WordbookForm';

interface WordbookActionsProps {
  name: string;
  wordbookId: string;
}

/** rename 입력과 destructive 삭제 확인을 독립 Dialog로 관리한다 */
export function WordbookActions({
  name,
  wordbookId,
}: WordbookActionsProps) {
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deletion = useMutation({
    mutationFn: () => deleteWordbook(wordbookId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['learner', 'wordbooks'],
      });
      setDeleteOpen(false);
    },
    retry: false,
  });

  return (
    <div className='flex flex-wrap gap-cluster'>
      <Dialog
        onOpenChange={setRenameOpen}
        open={renameOpen}
      >
        <DialogTrigger asChild>
          <Button
            type='button'
            variant='outline'
          >
            이름 변경
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>단어장 이름 변경</DialogTitle>
            <DialogDescription>1자에서 50자 사이로 입력하세요.</DialogDescription>
          </DialogHeader>
          <WordbookForm
            initialName={name}
            onConfirmed={() => setRenameOpen(false)}
            wordbookId={wordbookId}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
      >
        <DialogTrigger asChild>
          <Button
            type='button'
            variant='destructive'
          >
            삭제
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>단어장을 삭제할까요?</DialogTitle>
            <DialogDescription>
              단어장과 membership이 삭제되며 공용 어휘는 유지됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deletion.isPending}
              onClick={() => deletion.mutate()}
              type='button'
              variant='destructive'
            >
              삭제 확인
            </Button>
          </DialogFooter>
          {deletion.isError ? (
            <p className='text-body text-danger'>
              단어장을 삭제하지 못했습니다.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
