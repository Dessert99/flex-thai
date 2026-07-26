/** 답안 선택과 멱등 제출 command의 수명주기를 관리한다 */
import type {
  PublicThaiSentence,
  SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  submitAnswer,
  type SubmitAnswerCommand,
} from '../api/submitAnswerMutation';
import { createClientAttemptId } from '../model/createClientAttemptId';
import { InlineSentenceChoices } from './InlineSentenceChoices';

interface SubmitAnswerFormProps {
  inlineSentences?: readonly PublicThaiSentence[];
  onConfirmed?: (response: SubmitQuestionAttemptResponse) => void;
  onReset?: () => void;
  options: readonly SubmitAnswerOption[];
  questionId: string;
  questionVersionId: string;
}

interface SubmitAnswerOptionBase {
  id: string;
}

/** 표준 문장 또는 QUESTION 문장 inline 범위를 가리키는 제출 선택지 */
export type SubmitAnswerOption =
  | (SubmitAnswerOptionBase & { label: string; span: null })
  | (SubmitAnswerOptionBase & {
      label: null;
      span: {
        sentenceVersionId: string;
        startTokenIndex: number;
        endTokenIndex: number;
      };
    });

/** 실패 재시도에는 command를 보존하고 다시 풀기에서만 새 제출을 시작한다 */
export function SubmitAnswerForm({
  inlineSentences = [],
  onConfirmed,
  onReset,
  options,
  questionId,
  questionVersionId,
}: SubmitAnswerFormProps) {
  const startedAt = useRef<number | undefined>(undefined);
  const [selectedOptionId, setSelectedOptionId] = useState<string>();
  const [command, setCommand] = useState<SubmitAnswerCommand>();
  const [feedback, setFeedback] = useState<SubmitQuestionAttemptResponse>();
  const mutation = useMutation({
    mutationFn: submitAnswer,
    retry: false,
    onSuccess: (response) => {
      setSelectedOptionId(response.attempt.selectedOptionId);
      setFeedback(response);
      onConfirmed?.(response);
    },
  });

  const submit = () => {
    if (selectedOptionId === undefined) {
      return;
    }
    const submittedAt = Date.now();
    const nextCommand =
      command ??
      ({
        clientAttemptId: createClientAttemptId(),
        durationMs: Math.max(
          0,
          submittedAt - (startedAt.current ?? submittedAt),
        ),
        questionId,
        questionVersionId,
        selectedOptionId,
      } satisfies SubmitAnswerCommand);
    setCommand(nextCommand);
    mutation.mutate(nextCommand);
  };

  const selectOption = (optionId: string) => {
    startedAt.current ??= Date.now();
    setSelectedOptionId(optionId);
    if (command?.selectedOptionId !== optionId) {
      setCommand(undefined);
    }
  };

  const reset = () => {
    setSelectedOptionId(undefined);
    setCommand(undefined);
    setFeedback(undefined);
    mutation.reset();
    startedAt.current = undefined;
    onReset?.();
  };

  return (
    <form
      className='grid gap-section'
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <AnswerOptions
        feedback={feedback}
        disabled={mutation.isPending || feedback !== undefined}
        inlineSentences={inlineSentences}
        onSelect={selectOption}
        options={options}
        selectedOptionId={selectedOptionId}
      />
      {mutation.isError ? <SubmissionError /> : null}
      <Button
        disabled={
          selectedOptionId === undefined ||
          mutation.isPending ||
          feedback !== undefined
        }
        type='submit'
      >
        {getSubmitLabel(feedback, mutation.isError)}
      </Button>
      {feedback === undefined ? null : (
        <AnswerFeedback
          isCorrect={feedback.attempt.isCorrect}
          onReset={reset}
        />
      )}
    </form>
  );
}

function AnswerOptions({
  disabled,
  feedback,
  inlineSentences,
  onSelect,
  options,
  selectedOptionId,
}: {
  disabled: boolean;
  feedback: SubmitQuestionAttemptResponse | undefined;
  inlineSentences: readonly PublicThaiSentence[];
  onSelect: (optionId: string) => void;
  options: readonly SubmitAnswerOption[];
  selectedOptionId: string | undefined;
}) {
  const confirmedOptionId =
    feedback?.attempt.selectedOptionId ?? selectedOptionId;
  return (
    <fieldset className='grid gap-cluster'>
      <legend className='sr-only'>답안 선택</legend>
      <InlineSentenceChoices
        answerFeedback={feedback}
        confirmedOptionId={confirmedOptionId}
        disabled={disabled}
        onSelect={onSelect}
        options={options}
        sentences={inlineSentences}
      />
      {options
        .filter(
          (option): option is Extract<SubmitAnswerOption, { label: string }> =>
            option.span === null,
        )
        .map((option) => (
          <div
            className='flex items-center gap-cluster rounded-control border border-default p-cluster'
            key={option.id}
          >
            <Input
              aria-label={getOptionAccessibleName(
                option,
                confirmedOptionId,
                feedback,
                inlineSentences,
              )}
              checked={confirmedOptionId === option.id}
              className='size-icon shrink-0 p-px shadow-none'
              disabled={disabled}
              id={`answer-${option.id}`}
              name='answer'
              onChange={() => {
                onSelect(option.id);
              }}
              type='radio'
              value={option.id}
            />
            <Label
              className='font-thai text-body'
              htmlFor={`answer-${option.id}`}
              lang='th'
            >
              {option.label}
            </Label>
            {confirmedOptionId === option.id && feedback !== undefined ? (
              <span>선택한 답</span>
            ) : null}
            {feedback?.feedback.correctOptionId === option.id ? (
              <span>정답</span>
            ) : null}
          </div>
        ))}
    </fieldset>
  );
}

function getSubmitLabel(
  feedback: SubmitQuestionAttemptResponse | undefined,
  isError: boolean,
) {
  if (feedback !== undefined) {
    return '제출 완료';
  }
  return isError ? '같은 답안 다시 제출' : '답안 제출';
}

function getOptionAccessibleName(
  option: SubmitAnswerOption,
  selectedOptionId: string | undefined,
  feedback: SubmitQuestionAttemptResponse | undefined,
  inlineSentences: readonly PublicThaiSentence[],
) {
  const surface = getOptionSurface(option, inlineSentences);
  if (feedback === undefined) {
    return surface;
  }

  return [
    surface,
    selectedOptionId === option.id ? '선택한 답' : null,
    feedback.feedback.correctOptionId === option.id ? '정답' : null,
  ]
    .filter((value) => value !== null)
    .join(' ');
}

function getOptionSurface(
  option: SubmitAnswerOption,
  sentences: readonly PublicThaiSentence[],
) {
  if (option.span === null) {
    return option.label;
  }
  const sentence = sentences.find(
    (candidate) =>
      candidate.sentenceVersionId === option.span.sentenceVersionId,
  );
  return (
    sentence?.tokens
      .slice(option.span.startTokenIndex, option.span.endTokenIndex)
      .map((token) => token.surface)
      .join('') ?? ''
  );
}

function SubmissionError() {
  return (
    <p className='text-body text-danger'>
      답안을 제출하지 못했습니다. 같은 답안을 다시 제출할 수 있습니다.
    </p>
  );
}

function AnswerFeedback({
  isCorrect,
  onReset,
}: {
  isCorrect: boolean;
  onReset: () => void;
}) {
  return (
    <section
      aria-live='polite'
      className='grid gap-cluster rounded-panel border border-default bg-surface-muted p-page'
    >
      <p className='text-title text-primary'>
        {isCorrect ? '정답입니다.' : '오답입니다.'}
      </p>
      <Button
        onClick={onReset}
        type='button'
        variant='outline'
      >
        다시 풀기
      </Button>
    </section>
  );
}
