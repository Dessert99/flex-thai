/** 한 어휘의 여러 단어장 membership을 서버 확정 방식으로 변경한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
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
  pickerWordbookListQueryOptions,
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
// 두 query와 mutation 확정 상태를 한 Dialog 수명에서 조정한다.
// eslint-disable-next-line complexity, max-lines-per-function
export function VocabularyWordbookPicker({
  onConfirmed,
  vocabularyId,
}: VocabularyWordbookPickerProps) {
  const queryClient = useQueryClient();
  const wordbooks = useQuery(pickerWordbookListQueryOptions());
  const memberships = useQuery(
    vocabularyWordbookMembershipQueryOptions(vocabularyId),
  );
  const [confirmedIds, setConfirmedIds] = useState<Set<string> | null>(null);
  const activeIds =
    confirmedIds ?? new Set(memberships.data?.wordbookIds ?? []);

  const mutation = useMutation({
    mutationFn: ({ remove, wordbookId }: MembershipCommand) =>
      remove
        ? removeVocabularyFromWordbook(wordbookId, vocabularyId)
        : addVocabularyToWordbook(wordbookId, vocabularyId),
    onSuccess: async (_data, command) => {
      const next = new Set(activeIds);
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
  let content: ReactNode;
  if (wordbooks.isPending || memberships.isPending) {
    content = <p>단어장을 불러오고 있습니다.</p>;
  } else if (
    wordbooks.isError ||
    memberships.isError ||
    wordbooks.data === undefined
  ) {
    content = (
      <p className='text-body text-danger'>
        단어장 membership을 불러오지 못했습니다.
      </p>
    );
  } else if (wordbooks.data.items.length === 0) {
    content = <p>먼저 단어장을 만들어 주세요.</p>;
  } else {
    content = (
      <ul className='grid gap-cluster'>
        {wordbooks.data.items.map((wordbook) => {
          const pressed = activeIds.has(wordbook.id);
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
    );
  }

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
        {content}
        {mutation.isError ? (
          <p className='text-body text-danger'>
            단어장 membership을 변경하지 못했습니다.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
