/** 세부 문제 유형과 다음 DRAFT 버전 생성 입력을 분리해 관리한다 */
import {
  createQuestionTypeVersionRequestSchema,
  questionMajorCategoryMetadata,
  type CreateQuestionTypeRequest,
  type CreateQuestionTypeVersionRequest,
  type QuestionTaxonomySettingsResponse,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { questionTypeFormSchema } from '../model/questionTaxonomyFormSchema';

type QuestionTypeVersion =
  QuestionTaxonomySettingsResponse['questionTypes'][number]['versions'][number];

/** 기존 유형의 설정을 시작점으로 다음 DRAFT 버전을 생성한다 */
export function CreateQuestionTypeVersionForm({
  initial,
  onCreate,
}: {
  initial: QuestionTypeVersion;
  onCreate: (input: CreateQuestionTypeVersionRequest) => void;
}) {
  const [template, setTemplate] = useState(initial.template);
  const [optionCount, setOptionCount] = useState<3 | 4>(initial.optionCount);
  const [decisionRulesJson, setDecisionRulesJson] = useState(
    JSON.stringify(initial.decisionRules, null, 2),
  );

  return (
    <form
      className='grid gap-cluster rounded-panel border border-default p-cluster md:grid-cols-4'
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const parsed = createQuestionTypeVersionRequestSchema.safeParse({
            template,
            optionCount,
            decisionRules: JSON.parse(decisionRulesJson) as unknown,
          });
          if (parsed.success) onCreate(parsed.data);
        } catch {
          return;
        }
      }}
    >
      <Select
        onValueChange={(value) => {
          const parsed =
            createQuestionTypeVersionRequestSchema.shape.template.safeParse(
              value,
            );
          if (parsed.success) setTemplate(parsed.data);
        }}
        value={template}
      >
        <SelectTrigger aria-label='vNext 템플릿'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[
            'STANDARD_CHOICE',
            'PASSAGE_CHOICE',
            'DIALOGUE_CHOICE',
            'INLINE_SPAN_CHOICE',
          ].map((value) => (
            <SelectItem
              key={value}
              value={value}
            >
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) => setOptionCount(value === '3' ? 3 : 4)}
        value={String(optionCount)}
      >
        <SelectTrigger aria-label='vNext 선택지 수'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='3'>3</SelectItem>
          <SelectItem value='4'>4</SelectItem>
        </SelectContent>
      </Select>
      <Textarea
        aria-label='vNext 판정 규칙 JSON'
        onChange={(event) => setDecisionRulesJson(event.target.value)}
        value={decisionRulesJson}
      />
      <Button type='submit'>vNext DRAFT 만들기</Button>
    </form>
  );
}

/** FLEX 대분류 아래에 새 세부 문제 유형을 생성한다 */
export function CreateQuestionTypeForm({
  onCreate,
}: {
  onCreate: (input: CreateQuestionTypeRequest) => void;
}) {
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [majorCategory, setCategory] = useState<
    CreateQuestionTypeRequest['majorCategory']
  >('READING_VOCABULARY_GRAMMAR');

  return (
    <form
      className='grid gap-cluster rounded-panel border border-default p-page md:grid-cols-4'
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = questionTypeFormSchema.safeParse({
          slug,
          displayName,
          majorCategory,
        });
        if (parsed.success) onCreate(parsed.data);
      }}
    >
      <Input
        aria-label='세부 유형 slug'
        onChange={(event) => setSlug(event.target.value)}
        placeholder='reading-vocabulary'
        value={slug}
      />
      <Input
        aria-label='세부 유형 이름'
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder='어휘 의미 선택'
        value={displayName}
      />
      <Select
        onValueChange={(value) => {
          const parsed =
            questionTypeFormSchema.shape.majorCategory.safeParse(value);
          if (parsed.success) setCategory(parsed.data);
        }}
        value={majorCategory}
      >
        <SelectTrigger aria-label='FLEX 대분류'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(questionMajorCategoryMetadata).map(
            ([value, { label }]) => (
              <SelectItem
                key={value}
                value={value}
              >
                {label}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <Button type='submit'>세부 유형 만들기</Button>
    </form>
  );
}
