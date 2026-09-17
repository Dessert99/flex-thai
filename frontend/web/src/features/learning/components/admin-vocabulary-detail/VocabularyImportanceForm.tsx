/** 공개 어휘의 출제 중요도를 다른 콘텐츠 수정과 독립적으로 조정한다. */
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import { adminVocabularyImportanceRequestSchema } from '@flex-thia/contracts/admin/vocabularies';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
export function VocabularyImportanceForm({
  vocabularyId,
  importanceWeight,
}: {
  vocabularyId: string;
  importanceWeight: number;
}) {
  const [weight, setWeight] = useState(importanceWeight);
  const client = useQueryClient();
  const save = useMutation({
    throwOnError: false,
    mutationFn: () =>
      authenticatedRequest({
        path: `/admin/vocabularies/${vocabularyId}/importance`,
        method: 'PUT',
        body: adminVocabularyImportanceRequestSchema.parse({
          importanceWeight: weight,
        }),
        response: { kind: 'empty' },
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin', 'vocabularies'] }),
  });
  return (
    <form
      className='grid gap-cluster'
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Label htmlFor='vocabulary-importance'>출제 중요도 (1~10)</Label>
      <Input
        id='vocabulary-importance'
        type='number'
        min={1}
        max={10}
        step={1}
        required
        value={weight}
        onChange={(event) => setWeight(Number(event.target.value))}
      />
      <Button
        disabled={save.isPending}
        type='submit'
      >
        중요도 저장
      </Button>
      {save.isError ? <p role='alert'>중요도를 저장하지 못했습니다.</p> : null}
      {save.isSuccess ? <p role='status'>중요도를 저장했습니다.</p> : null}
    </form>
  );
}
