/** 태국어 문장의 단어·표현 피드백과 음성을 상호작용 형태로 제공한다 */
import type {
  PublicThaiSentence,
  ThaiExpressionFeedback,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { segmentThaiSentence } from '../model/segmentThaiSentence';
import { useThaiAudioPlayback } from '../model/useThaiAudioPlayback';
import { ThaiFeedbackTrigger, type ThaiFeedback } from './ThaiFeedbackTrigger';

interface InteractiveThaiSentenceProps {
  sentence: PublicThaiSentence;
  showTranslation?: boolean;
}

/** 태국어 문장을 token trigger와 대표 표현 trigger로 렌더링한다 */
export function InteractiveThaiSentence({
  sentence,
  showTranslation = false,
}: InteractiveThaiSentenceProps) {
  const [selectedFeedback, setSelectedFeedback] = useState<ThaiFeedback | null>(
    null,
  );
  const { playAudio, playbackError } = useThaiAudioPlayback();

  const activateFeedback = async (feedback: ThaiFeedback) => {
    setSelectedFeedback(feedback);
    await playAudio(feedback.audioUrl);
  };

  return (
    <div className='grid gap-cluster'>
      <p
        lang='th'
        className='flex flex-wrap items-baseline'
      >
        <SentenceTokenTriggers
          sentence={sentence}
          onSelect={setSelectedFeedback}
          onActivate={(feedback) => {
            void activateFeedback(feedback);
          }}
        />
      </p>
      {showTranslation ? (
        <p className='text-body text-muted-foreground'>
          {sentence.translationKo}
        </p>
      ) : null}

      {sentence.expressions.some((expression) => expression.representative) ? (
        <div className='flex flex-wrap gap-cluster'>
          {sentence.expressions
            .filter((expression) => expression.representative)
            .map((expression) => (
              <ExpressionFeedbackTrigger
                key={`${expression.startTokenIndex}-${expression.endTokenIndex}`}
                expression={expression}
                sentence={sentence}
                onSelect={setSelectedFeedback}
                onActivate={(feedback) => {
                  void activateFeedback(feedback);
                }}
              />
            ))}
        </div>
      ) : null}

      {selectedFeedback === null ? null : (
        <dl className='grid gap-cluster text-body'>
          <div>
            <dt className='sr-only'>뜻</dt>
            <dd>{selectedFeedback.contextMeaningKo}</dd>
          </div>
          <div>
            <dt className='sr-only'>발음</dt>
            <dd>{selectedFeedback.pronunciationKo}</dd>
          </div>
          <div>
            <dt className='sr-only'>성조</dt>
            <dd>{selectedFeedback.toneMarks}</dd>
          </div>
        </dl>
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

interface SentenceTokenTriggersProps {
  sentence: PublicThaiSentence;
  onActivate: (feedback: ThaiFeedback) => void;
  onSelect: (feedback: ThaiFeedback) => void;
}

function SentenceTokenTriggers({
  sentence,
  onActivate,
  onSelect,
}: SentenceTokenTriggersProps) {
  return segmentThaiSentence(sentence).map((segment, index) => {
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
        onSelect={onSelect}
        onActivate={onActivate}
      />
    );
  });
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
