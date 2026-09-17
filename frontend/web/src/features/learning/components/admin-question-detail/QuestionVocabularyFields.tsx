/** 공용 단어장에서 사용 어휘와 뜻을 골라 출제 역할·실제 횟수를 기록한다. */
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/select';
import type { AdminQuestionPayload } from '@flex-thia/contracts/admin/questions';
import {
  adminVocabularyDetailResponseSchema,
  type AdminVocabularyDetailResponse,
} from '@flex-thia/contracts/admin/vocabularies';
import { queryOptions, useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { vocabularyListQueryOptions } from '../../apis/vocabulary-list/vocabularyListQueries';
export function QuestionVocabularyFields({
  value,
  onChange,
}: {
  value: AdminQuestionPayload['vocabularies'];
  onChange: (value: AdminQuestionPayload['vocabularies']) => void;
}) {
  const [search, setSearch] = useState('');
  const results = useQuery(
    vocabularyListQueryOptions({
      ...(search.trim() ? { query: search.trim() } : {}),
      page: 1,
      pageSize: 20,
    }),
  );
  const details = useQueries({
    queries: value.map((item) =>
      queryOptions({
        queryKey: ['admin', 'vocabularies', 'detail', item.vocabularyId],
        queryFn: () =>
          authenticatedRequest({
            path: `/admin/vocabularies/${item.vocabularyId}`,
            response: {
              kind: 'json',
              schema: adminVocabularyDetailResponseSchema,
            },
          }),
      }),
    ),
  });
  const update = (
    index: number,
    patch: Partial<AdminQuestionPayload['vocabularies'][number]>,
  ) =>
    onChange(
      value.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  return (
    <fieldset className='grid gap-cluster'>
      <legend>문제에 사용한 어휘</legend>
      <p className='text-caption text-subtle'>
        지문·문제·보기의 실제 등장 횟수입니다. 해설은 제외합니다.
      </p>
      {value.map((item, index) => (
        <QuestionVocabularyRow
          key={item.vocabularyId}
          item={item}
          detail={details[index]?.data}
          update={(patch) => update(index, patch)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        />
      ))}
      <Label htmlFor='question-word-search'>사용 어휘 검색</Label>
      <Input
        id='question-word-search'
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className='flex flex-wrap gap-cluster'>
        {results.data?.items
          .filter(
            (word) => !value.some((item) => item.vocabularyId === word.id),
          )
          .map((word) => (
            <Button
              type='button'
              variant='outline'
              key={word.id}
              onClick={() =>
                onChange([
                  ...value,
                  {
                    vocabularyId: word.id,
                    meaningId: null,
                    role: 'CONTEXT',
                    occurrenceCount: 1,
                  },
                ])
              }
            >
              {word.thai} 추가
            </Button>
          ))}
      </div>
    </fieldset>
  );
}

function QuestionVocabularyRow({
  item,
  detail,
  update,
  onRemove,
}: {
  item: AdminQuestionPayload['vocabularies'][number];
  detail: AdminVocabularyDetailResponse | undefined;
  update: (
    patch: Partial<AdminQuestionPayload['vocabularies'][number]>,
  ) => void;
  onRemove: () => void;
}) {
  return (
    <div className='grid gap-cluster rounded-panel border border-default p-cluster'>
      <strong lang='th'>{detail?.thai ?? '어휘 불러오는 중'}</strong>
      <Select
        value={item.meaningId ?? 'NONE'}
        onValueChange={(meaningId) =>
          update({
            meaningId: meaningId === 'NONE' ? null : meaningId,
          })
        }
      >
        <SelectTrigger aria-label='사용한 뜻'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='NONE'>특정 뜻 미지정</SelectItem>
          {detail?.meanings.map((meaning) => (
            <SelectItem
              key={meaning.id}
              value={meaning.id}
            >
              {meaning.meaningKo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={item.role}
        onValueChange={(role) => update({ role: role as 'TARGET' | 'CONTEXT' })}
      >
        <SelectTrigger aria-label='출제 역할'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='TARGET'>출제 목표</SelectItem>
          <SelectItem value='CONTEXT'>문맥에 등장</SelectItem>
        </SelectContent>
      </Select>
      <Label>
        등장 횟수
        <Input
          type='number'
          min={1}
          step={1}
          value={item.occurrenceCount}
          onChange={(event) =>
            update({ occurrenceCount: Number(event.target.value) })
          }
        />
      </Label>
      <Button
        type='button'
        variant='outline'
        onClick={onRemove}
      >
        어휘 연결 제거
      </Button>
    </div>
  );
}
