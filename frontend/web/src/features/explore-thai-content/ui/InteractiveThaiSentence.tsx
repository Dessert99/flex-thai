/** 태국어 문장의 단어·표현 피드백과 음성을 상호작용 형태로 제공한다 */
import type {
  PublicThaiSentence,
  ThaiExpressionFeedback,
} from '@flex-thia/contracts';
import { useEffect, useRef, useState } from 'react';
import { segmentThaiSentence } from '../model/segmentThaiSentence';
import {
  ThaiFeedbackTrigger,
  type ThaiFeedback,
} from './ThaiFeedbackTrigger';

interface InteractiveThaiSentenceProps {
  sentence: PublicThaiSentence;
}

/** 태국어 문장을 token trigger와 대표 표현 trigger로 렌더링한다 */
export function InteractiveThaiSentence({
  sentence,
}: InteractiveThaiSentenceProps) {
  const [selectedFeedback, setSelectedFeedback] =
    useState<ThaiFeedback | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      playingAudioRef.current?.pause();
    },
    [],
  );

  const activateFeedback = async (feedback: ThaiFeedback) => {
    setSelectedFeedback(feedback);
    setPlaybackError(null);

    if (feedback.audioUrl === null) {
      return;
    }

    if (playingAudioRef.current !== null) {
      playingAudioRef.current.pause();
      playingAudioRef.current.currentTime = 0;
    }

    const audio = new Audio(feedback.audioUrl);
    playingAudioRef.current = audio;

    try {
      await audio.play();
    } catch {
      setPlaybackError('음성을 재생할 수 없습니다.');
    }
  };

  return (
    <div className="space-y-3">
      <p lang="th" className="flex flex-wrap items-baseline">
        {segmentThaiSentence(sentence).map((segment, index) => {
          if (segment.kind === 'TEXT') {
            return <span key={`text-${index}`}>{segment.text}</span>;
          }

          const token = sentence.tokens.find(
            (candidate) => candidate.position === segment.tokenIndex,
          );
          if (token === undefined) {
            return <span key={`token-${index}`}>{segment.text}</span>;
          }

          return (
            <ThaiFeedbackTrigger
              key={`token-${token.position}`}
              surface={segment.text}
              label={`${segment.text} 뜻과 발음 듣기`}
              feedback={token}
              onSelect={setSelectedFeedback}
              onActivate={activateFeedback}
            />
          );
        })}
      </p>

      {sentence.expressions.some((expression) => expression.representative) ? (
        <div className="flex flex-wrap gap-2">
          {sentence.expressions
            .filter((expression) => expression.representative)
            .map((expression) => (
              <ExpressionFeedbackTrigger
                key={`${expression.startTokenIndex}-${expression.endTokenIndex}`}
                expression={expression}
                sentence={sentence}
                onSelect={setSelectedFeedback}
                onActivate={activateFeedback}
              />
            ))}
        </div>
      ) : null}

      {selectedFeedback === null ? null : (
        <dl className="grid gap-1 text-sm">
          <div>
            <dt className="sr-only">뜻</dt>
            <dd>{selectedFeedback.contextMeaningKo}</dd>
          </div>
          <div>
            <dt className="sr-only">발음</dt>
            <dd>{selectedFeedback.pronunciationKo}</dd>
          </div>
          <div>
            <dt className="sr-only">성조</dt>
            <dd>{selectedFeedback.toneMarks}</dd>
          </div>
        </dl>
      )}
      {playbackError === null ? null : (
        <p role="status" aria-live="polite">
          {playbackError}
        </p>
      )}
    </div>
  );
}

interface ExpressionFeedbackTriggerProps {
  expression: ThaiExpressionFeedback;
  sentence: PublicThaiSentence;
  onActivate: (feedback: ThaiFeedback) => void;
  onSelect: (feedback: ThaiFeedback) => void;
}

function ExpressionFeedbackTrigger({
  expression,
  sentence,
  onActivate,
  onSelect,
}: ExpressionFeedbackTriggerProps) {
  const surface = sentence.tokens
    .slice(expression.startTokenIndex, expression.endTokenIndex)
    .map((token) => token.surface)
    .join('');

  return (
    <ThaiFeedbackTrigger
      surface={surface}
      label={`표현 ${surface} 뜻과 발음 듣기`}
      feedback={expression}
      onSelect={onSelect}
      onActivate={onActivate}
    />
  );
}
