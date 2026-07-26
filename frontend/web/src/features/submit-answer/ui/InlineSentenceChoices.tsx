/** 인라인 선택지를 문제 문장 좌표에 표시하고 토큰 피드백을 제공한다 */
import type { PublicThaiSentence } from '@flex-thia/contracts';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import type { SubmitAnswerOption } from './SubmitAnswerForm';

interface InlineSentenceChoicesProps {
  options: readonly SubmitAnswerOption[];
  sentences: readonly PublicThaiSentence[];
}

type InlineOption = Extract<SubmitAnswerOption, { label: null }>;
type ThaiFeedback = PublicThaiSentence['tokens'][number];

/** 문제 문장 안의 선택 범위와 문장 밖 토큰 피드백 버튼을 함께 표시한다 */
export function InlineSentenceChoices({
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
        .map((sentence) => (
          <InlineSentenceFlow
            key={sentence.sentenceVersionId}
            onActivate={(tokenFeedback) => {
              setFeedback(tokenFeedback);
              void playAudio(tokenFeedback.audioUrl);
            }}
            onSelect={setFeedback}
            options={inlineOptions.filter(
              (option) =>
                option.span.sentenceVersionId === sentence.sentenceVersionId,
            )}
            sentence={sentence}
          />
        ))}
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

function InlineSentenceFlow({
  onActivate,
  onSelect,
  options,
  sentence,
}: {
  onActivate: (feedback: ThaiFeedback) => void;
  onSelect: (feedback: ThaiFeedback) => void;
  options: readonly InlineOption[];
  sentence: PublicThaiSentence;
}) {
  const characters = Array.from(sentence.originalText);
  const fragments: ReactNode[] = [];
  let cursor = 0;

  for (const option of [...options].sort(
    (left, right) => left.span.startTokenIndex - right.span.startTokenIndex,
  )) {
    const tokens = sentence.tokens.slice(
      option.span.startTokenIndex,
      option.span.endTokenIndex,
    );
    const first = tokens.at(0);
    const last = tokens.at(-1);
    if (first === undefined || last === undefined) {
      continue;
    }
    if (cursor < first.startOffset) {
      fragments.push(
        <span key={`text-${cursor}`}>
          {characters.slice(cursor, first.startOffset).join('')}
        </span>,
      );
    }
    fragments.push(
      <mark
        data-testid='inline-option-span'
        id={`inline-option-${option.id}`}
        key={`mark-${option.id}`}
      >
        {characters.slice(first.startOffset, last.endOffset).join('')}
      </mark>,
      ...tokens.map((token) => (
        <ThaiFeedbackTrigger
          feedback={token}
          key={`feedback-${option.id}-${token.position}`}
          label={`${token.surface} 뜻과 발음 듣기`}
          onActivate={onActivate}
          onSelect={onSelect}
        />
      )),
    );
    cursor = last.endOffset;
  }
  if (cursor < characters.length) {
    fragments.push(
      <span key={`text-${cursor}`}>{characters.slice(cursor).join('')}</span>,
    );
  }

  return (
    <p
      className='flex flex-wrap items-baseline gap-cluster'
      lang='th'
    >
      {fragments}
    </p>
  );
}
