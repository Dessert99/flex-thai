/** retryable TTS 실패 항목 selection과 query invalidation을 관리한다 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  const eligible = items.filter(
    (item) => item.status === 'FAILED' && item.retryable,
  );
  const mutation = useMutation({
    mutationFn: () =>
      retryTtsItems(
        jobId,
        eligible
          .filter((item) => selected.includes(item.id))
          .map((item) => ({ itemId: item.id, expectedAttempt: item.attempt })),
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
  });
  return (
    <div className='grid gap-cluster'>
      {eligible.map((item) => (
        <Button
          aria-checked={selected.includes(item.id)}
          key={item.id}
          onClick={() =>
            setSelected((current) =>
              current.includes(item.id)
                ? current.filter((id) => id !== item.id)
                : [...current, item.id],
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
        disabled={selected.length === 0 || mutation.isPending}
        onClick={() => mutation.mutate()}
        type='button'
      >
        선택 재시도
      </Button>
    </div>
  );
}
