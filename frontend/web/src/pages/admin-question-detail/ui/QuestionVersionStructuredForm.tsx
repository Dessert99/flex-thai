/** 현재 문제 graph를 보존하는 기본 구조화 전체 교체 form을 제공한다 */
import {
  adminQuestionVersionPayloadSchema,
  type AdminQuestionVersionPayload,
} from '@flex-thia/contracts';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

interface QuestionVersionStructuredFormProps {
  disabled: boolean;
  initialPayload: AdminQuestionVersionPayload;
  onReplace: (payload: AdminQuestionVersionPayload) => void;
}

type SentenceField =
  'originalText' | 'translationKo' | 'pronunciationKo' | 'toneMarks';
type SetPayload = Dispatch<SetStateAction<AdminQuestionVersionPayload>>;
type Errors = Record<string, string>;

/** 문장·보기·정답·해설을 field path 단위로 검증해 canonical payload를 만든다 */
export function QuestionVersionStructuredForm({
  disabled,
  initialPayload,
  onReplace,
}: QuestionVersionStructuredFormProps) {
  const [payload, setPayload] = useState(initialPayload);
  const [errors, setErrors] = useState<Errors>({});
  const submit = () => {
    const parsed = adminQuestionVersionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            `${issue.path.join('.')}: ${issue.message}`,
          ]),
        ),
      );
      return;
    }
    setErrors({});
    onReplace(parsed.data);
  };

  return (
    <form
      className='grid gap-section'
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className='text-title text-primary'>구조화 편집</h2>
      <DifficultyField
        errors={errors}
        payload={payload}
        setPayload={setPayload}
      />
      <BlockFields
        errors={errors}
        payload={payload}
        setPayload={setPayload}
      />
      <OptionFields
        errors={errors}
        payload={payload}
        setPayload={setPayload}
      />
      <Button
        disabled={disabled}
        type='submit'
      >
        구조화 내용으로 전체 교체
      </Button>
    </form>
  );
}

function DifficultyField({
  errors,
  payload,
  setPayload,
}: {
  errors: Errors;
  payload: AdminQuestionVersionPayload;
  setPayload: SetPayload;
}) {
  return (
    <div className='grid gap-cluster'>
      <Label htmlFor='question-difficulty'>난이도</Label>
      <Input
        id='question-difficulty'
        max={5}
        min={1}
        onChange={(event) =>
          setPayload((current) => ({
            ...current,
            difficulty: Number(event.target.value),
          }))
        }
        type='number'
        value={payload.difficulty}
      />
      <FieldError
        errors={errors}
        path='difficulty'
      />
    </div>
  );
}

function BlockFields({
  errors,
  payload,
  setPayload,
}: {
  errors: Errors;
  payload: AdminQuestionVersionPayload;
  setPayload: SetPayload;
}) {
  return payload.blocks.map((block, blockIndex) => (
    <fieldset
      className='grid gap-cluster rounded-panel border border-default p-page'
      key={`${block.kind}-${blockIndex}`}
    >
      <legend className='px-cluster text-body text-primary'>
        {block.kind === 'EXPLANATION' ? '해설' : `본문 ${block.kind}`}
      </legend>
      {block.sentences.map((item, sentenceIndex) => (
        <SentenceFields
          errors={errors}
          key={`${blockIndex}-${sentenceIndex}`}
          onChange={(field, value) =>
            updateBlockSentence(
              setPayload,
              blockIndex,
              sentenceIndex,
              field,
              value,
            )
          }
          path={`blocks.${blockIndex}.sentences.${sentenceIndex}.sentence`}
          sentence={item.sentence}
        />
      ))}
    </fieldset>
  ));
}

function OptionFields({
  errors,
  payload,
  setPayload,
}: {
  errors: Errors;
  payload: AdminQuestionVersionPayload;
  setPayload: SetPayload;
}) {
  return (
    <fieldset className='grid gap-cluster rounded-panel border border-default p-page'>
      <legend className='px-cluster text-body text-primary'>보기와 정답</legend>
      {payload.options.map((option, optionIndex) =>
        option.sentence === null ? (
          <p
            className='text-body text-subtle'
            key={option.clientRef}
          >
            보기 {optionIndex + 1}: inline 범위 {option.span.startTokenIndex}–
            {option.span.endTokenIndex}
          </p>
        ) : (
          <SentenceFields
            errors={errors}
            key={option.clientRef}
            onChange={(field, value) =>
              updateOptionSentence(setPayload, optionIndex, field, value)
            }
            path={`options.${optionIndex}.sentence`}
            sentence={option.sentence}
          />
        ),
      )}
      <Label htmlFor='question-correct-option'>정답 보기</Label>
      <select
        className='rounded-control border border-default bg-surface p-cluster'
        id='question-correct-option'
        onChange={(event) =>
          setPayload((current) => ({
            ...current,
            correctOptionRef: event.target.value,
          }))
        }
        value={payload.correctOptionRef}
      >
        {payload.options.map((option, index) => (
          <option
            key={option.clientRef}
            value={option.clientRef}
          >
            보기 {index + 1}
          </option>
        ))}
      </select>
      <FieldError
        errors={errors}
        path='correctOptionRef'
      />
    </fieldset>
  );
}

function SentenceFields({
  errors,
  onChange,
  path,
  sentence,
}: {
  errors: Errors;
  onChange: (field: SentenceField, value: string) => void;
  path: string;
  sentence: AdminQuestionVersionPayload['blocks'][number]['sentences'][number]['sentence'];
}) {
  return (
    <div className='grid gap-cluster'>
      {(
        [
          ['originalText', '태국어 문장'],
          ['translationKo', '한국어 번역'],
          ['pronunciationKo', '한국어 발음'],
          ['toneMarks', '성조 표기'],
        ] as const
      ).map(([field, label]) => {
        const fieldPath = `${path}.${field}`;
        const fieldId = fieldPath.replaceAll('.', '-');
        return (
          <div
            className='grid gap-cluster'
            key={field}
          >
            <Label htmlFor={fieldId}>{label}</Label>
            <Input
              aria-invalid={errors[fieldPath] !== undefined}
              id={fieldId}
              onChange={(event) => onChange(field, event.target.value)}
              value={sentence[field]}
            />
            <FieldError
              errors={errors}
              path={fieldPath}
            />
          </div>
        );
      })}
    </div>
  );
}

function updateBlockSentence(
  setPayload: SetPayload,
  blockIndex: number,
  sentenceIndex: number,
  field: SentenceField,
  value: string,
) {
  setPayload((current) => ({
    ...current,
    blocks: current.blocks.map((block, candidateBlockIndex) => ({
      ...block,
      sentences: block.sentences.map((item, candidateSentenceIndex) =>
        candidateBlockIndex === blockIndex &&
        candidateSentenceIndex === sentenceIndex
          ? { ...item, sentence: { ...item.sentence, [field]: value } }
          : item,
      ),
    })),
  }));
}

function updateOptionSentence(
  setPayload: SetPayload,
  optionIndex: number,
  field: SentenceField,
  value: string,
) {
  setPayload((current) => ({
    ...current,
    options: current.options.map((option, candidateIndex) =>
      candidateIndex === optionIndex && option.sentence !== null
        ? { ...option, sentence: { ...option.sentence, [field]: value } }
        : option,
    ),
  }));
}

function FieldError({ errors, path }: { errors: Errors; path: string }) {
  return errors[path] ? (
    <span className='text-caption text-danger'>{errors[path]}</span>
  ) : null;
}
