/** 문장 분할 없이 문제 본문·보기·해설·사용 어휘를 편집한다. */
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
import { Textarea } from '@/shared/components/textarea';
import {
  adminQuestionPayloadSchema,
  type AdminQuestionDetailResponse,
  type AdminQuestionPayload,
  type AdminQuestionStatusRequest,
  type AdminQuestionUpdateRequest,
} from '@flex-thia/contracts/admin/questions';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { questionTaxonomySettingsQueryOptions } from '../../apis/question-taxonomy-settings/questionTaxonomyQueries';
import { QuestionVocabularyFields } from './QuestionVocabularyFields';
export function AdminQuestionDetailPageView({
  data,
  onSave,
  onStatus,
  pending,
  error,
}: {
  data: AdminQuestionDetailResponse;
  onSave: (input: AdminQuestionUpdateRequest) => void;
  onStatus: (input: AdminQuestionStatusRequest) => void;
  pending: boolean;
  error: boolean;
}) {
  const [input, setInput] = useState<AdminQuestionPayload>(() =>
    adminQuestionPayloadSchema.parse(
      Object.fromEntries(
        Object.entries(data).filter(
          ([key]) =>
            ![
              'questionId',
              'version',
              'status',
              'createdAt',
              'updatedAt',
              'publishedAt',
            ].includes(key),
        ),
      ),
    ),
  );
  const [requiresRetry, setRequiresRetry] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const taxonomy = useQuery(questionTaxonomySettingsQueryOptions());
  const change = (patch: Partial<AdminQuestionPayload>) =>
    setInput((current) => ({ ...current, ...patch }));
  return (
    <section className='grid gap-section'>
      <header>
        <h1 className='text-title'>문제 편집 · 버전 {data.version}</h1>
        <p>
          {{ DRAFT: '초안', PUBLISHED: '공개', HIDDEN: '숨김' }[data.status]}
        </p>
      </header>
      <form
        className='grid gap-section'
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = adminQuestionPayloadSchema.safeParse(input);
          setInvalid(!parsed.success);
          if (parsed.success)
            onSave({
              input: parsed.data,
              expectedVersion: data.version,
              expectedUpdatedAt: data.updatedAt,
              requiresRetry,
            });
        }}
      >
        <fieldset
          disabled={pending}
          className='grid gap-cluster'
        >
          <Label>문제 유형</Label>
          <Select
            value={input.typeVersionId}
            onValueChange={(typeVersionId) => change({ typeVersionId })}
          >
            <SelectTrigger aria-label='문제 유형'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {taxonomy.data?.questionTypes.flatMap((type) =>
                type.versions
                  .filter(
                    (version) =>
                      version.status === 'ACTIVE' ||
                      version.id === input.typeVersionId,
                  )
                  .map((version) => (
                    <SelectItem
                      key={version.id}
                      value={version.id}
                    >
                      {type.displayName} · 유형 버전 {version.version}
                    </SelectItem>
                  )),
              )}
            </SelectContent>
          </Select>
          <Label>주제</Label>
          <Select
            value={input.topicId}
            onValueChange={(topicId) => change({ topicId })}
          >
            <SelectTrigger aria-label='주제'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {taxonomy.data?.topics
                .filter(
                  (topic) =>
                    topic.status === 'ACTIVE' || topic.id === input.topicId,
                )
                .map((topic) => (
                  <SelectItem
                    key={topic.id}
                    value={topic.id}
                  >
                    {topic.displayName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Label htmlFor='question-difficulty'>난이도</Label>
          <Input
            id='question-difficulty'
            type='number'
            min={1}
            max={5}
            value={input.difficulty}
            onChange={(event) =>
              change({ difficulty: Number(event.target.value) })
            }
          />
          <Label htmlFor='question-passage'>지문 (선택)</Label>
          <Textarea
            id='question-passage'
            lang='th'
            value={input.passage ?? ''}
            onChange={(event) =>
              change({ passage: event.target.value || null })
            }
          />
          <Label htmlFor='question-prompt'>문제</Label>
          <Textarea
            id='question-prompt'
            required
            lang='th'
            value={input.prompt}
            onChange={(event) => change({ prompt: event.target.value })}
          />
          <fieldset className='grid gap-cluster'>
            <legend>보기와 정답</legend>
            {input.options.map((option, index) => (
              <div
                className='flex items-center gap-cluster'
                key={option.id}
              >
                <Input
                  type='radio'
                  name='correct-answer'
                  className='size-icon'
                  aria-label={`${index + 1}번 정답`}
                  checked={input.correctOptionId === option.id}
                  onChange={() => change({ correctOptionId: option.id })}
                />
                <Input
                  aria-label={`${index + 1}번 보기`}
                  required
                  lang='th'
                  value={option.text}
                  onChange={(event) =>
                    change({
                      options: input.options.map((item) =>
                        item.id === option.id
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </fieldset>
          <Label htmlFor='question-explanation'>해설</Label>
          <Textarea
            id='question-explanation'
            required
            value={input.explanation}
            onChange={(event) => change({ explanation: event.target.value })}
          />
          <QuestionVocabularyFields
            value={input.vocabularies}
            onChange={(vocabularies) => change({ vocabularies })}
          />
          <Label className='flex gap-cluster'>
            <Input
              type='checkbox'
              className='size-icon'
              checked={requiresRetry}
              onChange={(event) => setRequiresRetry(event.target.checked)}
            />
            수정 후 다시 풀기 필요
          </Label>
          <p className='text-caption text-subtle'>
            단순 오탈자 수정일 때만 해제하세요. 정답 변경은 자동으로 새 버전이
            됩니다.
          </p>
          {invalid ? (
            <p role='alert'>
              문제·보기·정답·해설과 어휘 등장 횟수를 확인해주세요.
            </p>
          ) : null}
          {error ? (
            <p role='alert'>
              저장하지 못했습니다. 다른 수정이 있었는지 새로고침하여
              확인해주세요.
            </p>
          ) : null}
          <Button type='submit'>변경 저장</Button>
        </fieldset>
      </form>
      <Button
        disabled={pending}
        variant='outline'
        onClick={() =>
          onStatus({
            status: data.status === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED',
            expectedUpdatedAt: data.updatedAt,
          })
        }
      >
        {data.status === 'PUBLISHED' ? '문제 숨기기' : '저장된 문제 공개'}
      </Button>
    </section>
  );
}
