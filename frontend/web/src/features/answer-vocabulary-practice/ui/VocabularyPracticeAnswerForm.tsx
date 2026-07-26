/** 단어 연습 선택·멱등 제출·즉시 피드백 상태를 관리한다 */
import type {
  PracticeQuestion,
  SubmitVocabularyPracticeAnswerRequest,
  VocabularyPracticeAnswerResponse,
} from '@flex-thia/contracts';
import { type FormEvent, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

interface VocabularyPracticeAnswerFormProps {
  onAnswer: (
    request: SubmitVocabularyPracticeAnswerRequest,
  ) => Promise<VocabularyPracticeAnswerResponse>;
  onAnswered?: (feedback: VocabularyPracticeAnswerResponse) => void;
  question: PracticeQuestion;
}

/** 실패 재시도에는 같은 clientAnswerId를 보존하고 성공 뒤 선택을 잠근다 */
export function VocabularyPracticeAnswerForm({
  onAnswer,
  onAnswered,
  question,
}: VocabularyPracticeAnswerFormProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string>();
  const [clientAnswerId, setClientAnswerId] = useState<string>();
  const [feedback, setFeedback] = useState<VocabularyPracticeAnswerResponse>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedOptionId === undefined || pending || feedback !== undefined) {
      return;
    }
    const nextClientAnswerId = clientAnswerId ?? crypto.randomUUID();
    setClientAnswerId(nextClientAnswerId);
    setPending(true);
    setFailed(false);
    try {
      const response = await onAnswer({
        clientAnswerId: nextClientAnswerId,
        selectedOptionId,
      });
      setFeedback(response);
      onAnswered?.(response);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className='grid gap-section'
      onSubmit={(event) => void submit(event)}
    >
      <fieldset
        className='grid gap-cluster'
        disabled={pending || feedback !== undefined}
      >
        <legend className='sr-only'>답안 선택</legend>
        {question.options.map((option) => (
          <div
            className='flex items-center gap-cluster rounded-control border border-default p-cluster'
            key={option.id}
          >
            <Input
              checked={selectedOptionId === option.id}
              className='size-icon shrink-0 p-px shadow-none'
              id={`practice-answer-${option.id}`}
              name='practice-answer'
              onChange={() => {
                setSelectedOptionId(option.id);
                setClientAnswerId(undefined);
                setFailed(false);
              }}
              type='radio'
              value={option.id}
            />
            <Label htmlFor={`practice-answer-${option.id}`}>
              {option.label}
            </Label>
          </div>
        ))}
      </fieldset>
      {failed ? (
        <p role='alert'>답안을 제출하지 못했습니다. 다시 시도해 주세요.</p>
      ) : null}
      <Button
        disabled={
          selectedOptionId === undefined || pending || feedback !== undefined
        }
        type='submit'
      >
        {failed ? '같은 답안 다시 제출' : '답안 제출'}
      </Button>
      {feedback === undefined ? null : (
        <div
          aria-live='polite'
          className='grid gap-cluster'
        >
          <p>{feedback.isCorrect ? '정답입니다.' : '정답을 확인해 주세요.'}</p>
          <p>
            정답:{' '}
            {
              question.options.find(({ id }) => id === feedback.correctOptionId)
                ?.label
            }
          </p>
        </div>
      )}
    </form>
  );
}
