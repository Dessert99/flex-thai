/** 답안 선택과 멱등 제출 command의 수명주기를 관리한다 */
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import type { SubmitQuestionAttemptResponse } from '@flex-thia/contracts/learning/questions';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  submitAnswer,
  type SubmitAnswerCommand,
} from '../../apis/submit-answer/submitAnswerMutation';
import { createClientAttemptId } from '../../libs/submit-answer/createClientAttemptId';

interface SubmitAnswerFormProps {
  onConfirmed?: (response: SubmitQuestionAttemptResponse) => void;
  onReset?: () => void;
  options: readonly SubmitAnswerOption[];
  questionId: string;
  questionVersion: number;
}

export interface SubmitAnswerOption {
  id: string;
  text: string;
}

/** 실패 재시도에는 command를 보존하고 다시 풀기에서만 새 제출을 시작한다 */
export function SubmitAnswerForm({
  onConfirmed,
  onReset,
  options,
  questionId,
  questionVersion,
}: SubmitAnswerFormProps) {
  const startedAt = useRef<number | undefined>(undefined);
  const [selectedOptionId, setSelectedOptionId] = useState<string>();
  const [command, setCommand] = useState<SubmitAnswerCommand>();
  const [feedback, setFeedback] = useState<SubmitQuestionAttemptResponse>();
  const mutation = useMutation({
    throwOnError: false,
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
        questionVersion,
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
  onSelect,
  options,
  selectedOptionId,
}: {
  disabled: boolean;
  feedback: SubmitQuestionAttemptResponse | undefined;
  onSelect: (optionId: string) => void;
  options: readonly SubmitAnswerOption[];
  selectedOptionId: string | undefined;
}) {
  const confirmedOptionId =
    feedback?.attempt.selectedOptionId ?? selectedOptionId;
  return (
    <fieldset className='grid gap-cluster'>
      <legend className='sr-only'>답안 선택</legend>
      {options.map((option) => (
        <div
          className='flex items-center gap-cluster rounded-control border border-default p-cluster'
          key={option.id}
        >
          <Input
            aria-label={option.text}
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
            {option.text}
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

function SubmissionError() {
  return (
    <p className='text-body text-danger'>
      답안을 제출하지 못했습니다. 문제가 수정된 경우 새로고침 후 다시
      풀어주세요.
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
