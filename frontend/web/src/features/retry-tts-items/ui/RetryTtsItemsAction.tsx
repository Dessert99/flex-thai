/** retryable TTS 실패 항목 selection과 query invalidation을 관리한다 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { isApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { retryTtsItems } from '../api/retryTtsItems';

interface RetryItem {
  id: string;
  status: string;
  attempt: number;
  retryable: boolean;
}

/** FAILED·retryable 항목만 optimistic attempt와 함께 재시도한다 */
export function RetryTtsItemsAction({
  items,
  jobId,
}: {
  items: RetryItem[];
  jobId: string;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = useMemo(
    () => items.filter((item) => item.status === 'FAILED' && item.retryable),
    [items],
  );
  const selectedItems = eligible.filter((item) =>
    selected.includes(selectionKey(item)),
  );
  const mutation = useMutation({
    mutationFn: () =>
      retryTtsItems(
        jobId,
        selectedItems.map((item) => ({
          itemId: item.id,
          expectedAttempt: item.attempt,
        })),
      ),
    onSuccess: async () => {
      setSelected([]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['admin', 'tts', 'jobs', 'detail', jobId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['admin', 'tts', 'jobs', 'list'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['admin', 'tts', 'readiness'],
        }),
      ]);
    },
    onError: async (error) => {
      if (isStaleAttempt(error)) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['admin', 'tts', 'jobs', 'detail', jobId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['admin', 'tts', 'readiness'],
          }),
        ]);
      }
    },
  });
  if (eligible.length === 0) return null;
  return (
    <div className='grid gap-cluster'>
      {eligible.map((item) => (
        <Button
          aria-checked={selected.includes(selectionKey(item))}
          key={item.id}
          onClick={() =>
            setSelected((current) =>
              current.includes(selectionKey(item))
                ? current.filter((key) => key !== selectionKey(item))
                : [...current, selectionKey(item)],
            )
          }
          role='checkbox'
          type='button'
          variant='outline'
        >
          {item.id}
        </Button>
      ))}
      <Button
        disabled={selectedItems.length === 0 || mutation.isPending}
        onClick={() => mutation.mutate()}
        type='button'
      >
        선택 재시도
      </Button>
    </div>
  );
}

function selectionKey(item: RetryItem) {
  return `${item.id}:${item.attempt}`;
}

function isStaleAttempt(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.status === 409 &&
    error.detail.problem.code === 'TTS_ITEM_STALE_ATTEMPT'
  );
}
