/** 인라인 선택지를 문제 문장 좌표에 표시하고 토큰 피드백을 제공한다 */
import type {
  PublicThaiSentence,
  SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { SubmitAnswerOption } from './SubmitAnswerForm';

interface InlineSentenceChoicesProps {
  answerFeedback: SubmitQuestionAttemptResponse | undefined;
  confirmedOptionId: string | undefined;
  disabled: boolean;
  onSelect: (optionId: string) => void;
  options: readonly SubmitAnswerOption[];
  sentences: readonly PublicThaiSentence[];
}

type InlineOption = Extract<SubmitAnswerOption, { label: null }>;
type ThaiFeedback = PublicThaiSentence['tokens'][number];

/** 문제 문장 안의 선택 범위와 문장 밖 토큰 피드백 버튼을 함께 표시한다 */
export function InlineSentenceChoices({
  answerFeedback,
  confirmedOptionId,
  disabled,
  onSelect,
  options,
  sentences,
}: InlineSentenceChoicesProps) {
  const inlineOptions = options.filter(
    (option): option is InlineOption => option.span !== null,
  );
  const { playAudio, playbackError } = useInlineAudioPlayback();
  const [feedback, setFeedback] = useState<ThaiFeedback | null>(null);
  if (inlineOptions.length === 0) {
    return null;
  }

  return (
    <div className='grid gap-cluster'>
      {sentences
        .filter((sentence) =>
          inlineOptions.some(
            (option) =>
              option.span.sentenceVersionId === sentence.sentenceVersionId,
          ),
        )
        .flatMap((sentence) =>
          inlineOptions
            .filter(
              (option) =>
                option.span.sentenceVersionId === sentence.sentenceVersionId,
            )
            .map((option) => (
              <InlineOptionRow
                confirmedOptionId={confirmedOptionId}
                disabled={disabled}
                feedback={answerFeedback}
                key={option.id}
                onActivate={(tokenFeedback) => {
                  setFeedback(tokenFeedback);
                  void playAudio(tokenFeedback.audioUrl);
                }}
                onFeedbackSelect={setFeedback}
                onSelect={onSelect}
                option={option}
                sentence={sentence}
              />
            )),
        )}
      {feedback === null ? null : (
        <p>
          {feedback.contextMeaningKo} · {feedback.pronunciationKo} ·{' '}
          {feedback.toneMarks}
        </p>
      )}
      {playbackError === null ? null : (
        <p
          role='status'
          aria-live='polite'
        >
          {playbackError}
        </p>
      )}
    </div>
  );
}

function ThaiFeedbackTrigger({
  feedback,
  label,
  onActivate,
  onSelect,
}: {
  feedback: ThaiFeedback;
  label: string;
  onActivate: (feedback: ThaiFeedback) => void;
  onSelect: (feedback: ThaiFeedback) => void;
}) {
  return (
    <Button
      aria-label={label}
      className='h-auto text-body underline decoration-dotted underline-offset-4'
      onClick={() => onActivate(feedback)}
      onFocus={() => onSelect(feedback)}
      onMouseEnter={() => onSelect(feedback)}
      size='xs'
      type='button'
      variant='ghost'
    >
      발음
    </Button>
  );
}

function useInlineAudioPlayback() {
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      playingAudioRef.current?.pause();
    },
    [],
  );

  const playAudio = async (audioUrl: string | null) => {
    setPlaybackError(null);
    if (audioUrl === null) {
      return;
    }
    if (playingAudioRef.current !== null) {
      playingAudioRef.current.pause();
      playingAudioRef.current.currentTime = 0;
    }
    const audio = new Audio(audioUrl);
    playingAudioRef.current = audio;
    try {
      await audio.play();
    } catch {
      setPlaybackError('음성을 재생할 수 없습니다.');
    }
  };

  return { playAudio, playbackError };
}

function InlineOptionRow({
  confirmedOptionId,
  disabled,
  feedback,
  onActivate,
  onFeedbackSelect,
  onSelect,
  option,
  sentence,
}: {
  confirmedOptionId: string | undefined;
  disabled: boolean;
  feedback: SubmitQuestionAttemptResponse | undefined;
  onActivate: (feedback: ThaiFeedback) => void;
  onFeedbackSelect: (feedback: ThaiFeedback) => void;
  onSelect: (optionId: string) => void;
  option: InlineOption;
  sentence: PublicThaiSentence;
}) {
  const characters = Array.from(sentence.originalText);
  const tokens = sentence.tokens.slice(
    option.span.startTokenIndex,
    option.span.endTokenIndex,
  );
  const first = tokens.at(0);
  const last = tokens.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const surface = characters.slice(first.startOffset, last.endOffset).join('');
  const accessibleName = getAccessibleName(
    surface,
    option,
    confirmedOptionId,
    feedback,
  );

  return (
    <div
      className='flex flex-wrap items-center gap-cluster rounded-control border border-default p-cluster'
      data-testid='inline-option-row'
    >
      <Input
        aria-describedby={`inline-option-${option.id}`}
        aria-label={accessibleName}
        checked={confirmedOptionId === option.id}
        className='size-icon shrink-0 p-px shadow-none'
        disabled={disabled}
        id={`answer-${option.id}`}
        name='answer'
        onChange={() => onSelect(option.id)}
        type='radio'
        value={option.id}
      />
      <span
        data-testid='inline-sentence'
        lang='th'
      >
        {characters.slice(0, first.startOffset).join('')}
        <mark
          data-testid='inline-option-span'
          id={`inline-option-${option.id}`}
        >
          {surface}
        </mark>
        {characters.slice(last.endOffset).join('')}
      </span>
      {tokens.map((token) => (
        <ThaiFeedbackTrigger
          feedback={token}
          key={`feedback-${option.id}-${token.position}`}
          label={`${token.surface} 뜻과 발음 듣기`}
          onActivate={onActivate}
          onSelect={onFeedbackSelect}
        />
      ))}
      {confirmedOptionId === option.id && feedback !== undefined ? (
        <span>선택한 답</span>
      ) : null}
      {feedback?.feedback.correctOptionId === option.id ? (
        <span>정답</span>
      ) : null}
    </div>
  );
}

function getAccessibleName(
  surface: string,
  option: InlineOption,
  confirmedOptionId: string | undefined,
  feedback: SubmitQuestionAttemptResponse | undefined,
) {
  if (feedback === undefined) {
    return surface;
  }
  return [
    surface,
    confirmedOptionId === option.id ? '선택한 답' : null,
    feedback.feedback.correctOptionId === option.id ? '정답' : null,
  ]
    .filter((value) => value !== null)
    .join(' ');
}
