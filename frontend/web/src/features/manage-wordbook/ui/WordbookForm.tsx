/** 단어장 생성·이름 변경 입력과 서버 확정 상태를 관리한다 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { createWordbook, renameWordbook } from '../api/wordbookMutations';

interface WordbookFormProps {
  initialName?: string;
  onConfirmed?: () => void;
  wordbookId?: string;
}

/** 생성 또는 이름 변경을 trim된 이름 하나로 제출한다 */
export function WordbookForm({
  initialName = '',
  onConfirmed,
  wordbookId,
}: WordbookFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const mutation = useMutation({
    mutationFn: (trimmedName: string) =>
      wordbookId === undefined
        ? createWordbook(trimmedName)
        : renameWordbook(wordbookId, trimmedName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['learner', 'wordbooks'],
      });
      if (wordbookId === undefined) setName('');
      onConfirmed?.();
    },
    retry: false,
  });
  const label = wordbookId === undefined ? '새 단어장 이름' : '단어장 이름';
  const submit = wordbookId === undefined ? '단어장 만들기' : '변경 저장';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 50) return;
    mutation.mutate(trimmed);
  };

  return (
    <form
      className='grid gap-cluster'
      onSubmit={handleSubmit}
    >
      <label
        className='grid gap-cluster text-body'
        htmlFor={`wordbook-name-${wordbookId ?? 'new'}`}
      >
        {label}
        <Input
          id={`wordbook-name-${wordbookId ?? 'new'}`}
          maxLength={50}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </label>
      <Button
        disabled={mutation.isPending || name.trim().length === 0}
        type='submit'
      >
        {submit}
      </Button>
      {mutation.isError ? (
        <p className='text-body text-danger'>
          {wordbookId === undefined
            ? '단어장을 만들지 못했습니다.'
            : '단어장 이름을 변경하지 못했습니다.'}
        </p>
      ) : null}
    </form>
  );
}
