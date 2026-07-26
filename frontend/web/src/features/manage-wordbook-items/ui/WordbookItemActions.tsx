/** 단어장 선택 항목의 복사·이동·확인 제거를 관리한다 */
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
import {
  copyWordbookItems,
  moveWordbookItems,
  removeWordbookItems,
} from '../api/wordbookItemMutations';

interface WordbookItemActionsProps {
  onConfirmed: () => void;
  selectedIds: string[];
  sourceWordbookId: string;
  wordbooks: Array<{ id: string; name: string }>;
}

type Command = 'copy' | 'move' | 'remove';

/** 선택과 대상이 갖춰진 bulk 요청만 보내고 성공 뒤 cache를 갱신한다 */
// 행동 세 가지의 공통 mutation·확인 Dialog 상태를 한 경계에서 유지한다.
// eslint-disable-next-line max-lines-per-function
export function WordbookItemActions({
  onConfirmed,
  selectedIds,
  sourceWordbookId,
  wordbooks,
}: WordbookItemActionsProps) {
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (command: Command) => {
      if (command === 'remove') {
        return removeWordbookItems(sourceWordbookId, selectedIds);
      }
      const operation =
        command === 'copy' ? copyWordbookItems : moveWordbookItems;
      return operation(sourceWordbookId, targetId, selectedIds);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['learner', 'wordbooks'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['learner', 'vocabulary'],
        }),
      ]);
      setRemoveOpen(false);
      onConfirmed();
    },
    retry: false,
  });
  const disabled = selectedIds.length === 0 || mutation.isPending;
  const targetDisabled = disabled || targetId.length === 0;

  return (
    <section
      aria-label='선택 항목 관리'
      className='grid gap-cluster'
    >
      <label className='grid gap-cluster text-body'>
        대상 단어장
        <select
          className='h-control rounded-control border border-default bg-surface px-cluster'
          onChange={(event) => setTargetId(event.target.value)}
          value={targetId}
        >
          <option value=''>선택</option>
          {wordbooks
            .filter(({ id }) => id !== sourceWordbookId)
            .map((wordbook) => (
              <option
                key={wordbook.id}
                value={wordbook.id}
              >
                {wordbook.name}
              </option>
            ))}
        </select>
      </label>
      <div className='flex flex-wrap gap-cluster'>
        <Button
          disabled={targetDisabled}
          onClick={() => mutation.mutate('copy')}
          type='button'
        >
          복사
        </Button>
        <Button
          disabled={targetDisabled}
          onClick={() => mutation.mutate('move')}
          type='button'
        >
          이동
        </Button>
        <Dialog
          onOpenChange={setRemoveOpen}
          open={removeOpen}
        >
          <DialogTrigger asChild>
            <Button
              disabled={disabled}
              type='button'
              variant='destructive'
            >
              선택 제거
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>선택 항목을 제거할까요?</DialogTitle>
              <DialogDescription>
                공용 어휘는 유지되고 이 단어장의 membership만 제거됩니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => mutation.mutate('remove')}
                type='button'
                variant='destructive'
              >
                제거 확인
              </Button>
            </DialogFooter>
            {mutation.isError ? (
              <p className='text-body text-danger'>
                선택 항목을 변경하지 못했습니다.
              </p>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
      {mutation.isError && !removeOpen ? (
        <p className='text-body text-danger'>
          선택 항목을 변경하지 못했습니다.
        </p>
      ) : null}
    </section>
  );
}
