/** 단어장 삭제 확인 Dialog를 제공한다 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/dialog';
import { deleteWordbook } from '../../apis/manage-wordbook/wordbookMutations';

interface WordbookActionsProps {
  wordbookId: string;
}

/** 삭제 확인과 요청 상태를 관리한다 */
export function WordbookActions({ wordbookId }: WordbookActionsProps) {
  const queryClient = useQueryClient();
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
