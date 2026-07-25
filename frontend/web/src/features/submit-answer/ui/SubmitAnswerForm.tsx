/** 답안 선택과 멱등 제출 command의 수명주기를 관리한다 */
import type { SubmitQuestionAttemptResponse } from '@flex-thia/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import {
  submitAnswer,
  type SubmitAnswerCommand,
} from '../api/submitAnswerMutation';
import { createClientAttemptId } from '../model/createClientAttemptId';

interface SubmitAnswerFormProps {
  onConfirmed?: (response: SubmitQuestionAttemptResponse) => void;
  options: ReadonlyArray<{ id: string; label: string }>;
  questionId: string;
  questionVersionId: string;
}

/** 실패 재시도에는 command를 보존하고 다시 풀기에서만 새 제출을 시작한다 */
export function SubmitAnswerForm({
  onConfirmed,
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

  if (feedback !== undefined) {
    return (
      <AnswerFeedback
        isCorrect={feedback.attempt.isCorrect}
        onReset={() => {
          setSelectedOptionId(undefined);
          setCommand(undefined);
          setFeedback(undefined);
          mutation.reset();
          startedAt.current = undefined;
        }}
      />
    );
  }

  return (
    <form
      className='grid gap-section'
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <RadioGroup
        onValueChange={(value) => {
          startedAt.current ??= Date.now();
          setSelectedOptionId(value);
          if (command?.selectedOptionId !== value) {
            setCommand(undefined);
          }
        }}
        value={selectedOptionId ?? ''}
      >
        {options.map((option) => (
          <div
            className='flex items-center gap-cluster rounded-control border border-default p-cluster'
            key={option.id}
          >
            <RadioGroupItem
              id={`answer-${option.id}`}
              value={option.id}
            />
            <Label
              className='font-thai text-body'
              htmlFor={`answer-${option.id}`}
              lang='th'
            >
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {mutation.isError ? <SubmissionError /> : null}
      <Button
        disabled={selectedOptionId === undefined || mutation.isPending}
        type='submit'
      >
        {mutation.isError ? '같은 답안 다시 제출' : '답안 제출'}
      </Button>
    </form>
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
