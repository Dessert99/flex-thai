/** 한 어휘의 여러 단어장 membership을 서버 확정 방식으로 변경한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { wordbookListQueryOptions } from '@/pages/wordbook-list';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import {
  addVocabularyToWordbook,
  removeVocabularyFromWordbook,
  vocabularyWordbookMembershipQueryOptions,
} from '../api/vocabularyWordbookMutations';

interface VocabularyWordbookPickerProps {
  onConfirmed: (saved: boolean) => void;
  vocabularyId: string;
}

interface MembershipCommand {
  remove: boolean;
  wordbookId: string;
}

/** PUT·DELETE 성공 뒤에만 pressed 상태와 any-membership 요약을 갱신한다 */
export function VocabularyWordbookPicker({
  onConfirmed,
  vocabularyId,
}: VocabularyWordbookPickerProps) {
  const queryClient = useQueryClient();
  const wordbooks = useQuery(wordbookListQueryOptions());
  const memberships = useQuery(
    vocabularyWordbookMembershipQueryOptions(vocabularyId),
  );
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (memberships.data !== undefined) {
      setConfirmedIds(new Set(memberships.data.wordbookIds));
    }
  }, [memberships.data]);

  const mutation = useMutation({
    mutationFn: ({ remove, wordbookId }: MembershipCommand) =>
      remove
        ? removeVocabularyFromWordbook(wordbookId, vocabularyId)
        : addVocabularyToWordbook(wordbookId, vocabularyId),
    onSuccess: async (_data, command) => {
      const next = new Set(confirmedIds);
      if (command.remove) next.delete(command.wordbookId);
      else next.add(command.wordbookId);
      setConfirmedIds(next);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['learner', 'wordbooks'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['learner', 'vocabulary'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['learner', 'vocabularies'],
        }),
      ]);
      onConfirmed(next.size > 0);
    },
    retry: false,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type='button'
          variant='outline'
        >
          단어장에 추가
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>단어장 선택</DialogTitle>
          <DialogDescription>
            이 어휘를 저장할 단어장을 여러 개 선택할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        {wordbooks.isPending || memberships.isPending ? (
          <p>단어장을 불러오고 있습니다.</p>
        ) : wordbooks.isError ||
          memberships.isError ||
          wordbooks.data === undefined ? (
          <p className='text-body text-danger'>
            단어장 membership을 불러오지 못했습니다.
          </p>
        ) : wordbooks.data.items.length === 0 ? (
          <p>먼저 단어장을 만들어 주세요.</p>
        ) : (
          <ul className='grid gap-cluster'>
            {wordbooks.data.items.map((wordbook) => {
              const pressed = confirmedIds.has(wordbook.id);
              return (
                <li key={wordbook.id}>
                  <Button
                    aria-pressed={pressed}
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        remove: pressed,
                        wordbookId: wordbook.id,
                      })
                    }
                    type='button'
                    variant='outline'
                  >
                    {wordbook.name}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {mutation.isError ? (
          <p className='text-body text-danger'>
            단어장 membership을 변경하지 못했습니다.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
