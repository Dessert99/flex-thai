/** 정답 비노출 문제 상세와 사용자 제어 대본·답안 행동을 조합한다 */
import type { QuestionDetailResponse } from '@flex-thia/contracts';
import { useState } from 'react';
import { SubmitAnswerForm } from '@/features/submit-answer';
import { SavedQuestionButton } from '@/features/toggle-saved-question';
import { Button } from '@/shared/ui/button';
import { toQuestionSentenceViewModels } from '../model/questionViewModel';

interface QuestionSolvingPageViewProps {
  detail: QuestionDetailResponse;
  onSavedConfirmed: () => void;
}

/** 대본은 사용자 공개 뒤에만 렌더링하고 정답은 제출 Feature에 맡긴다 */
export function QuestionSolvingPageView({
  detail,
  onSavedConfirmed,
}: QuestionSolvingPageViewProps) {
  const [transcriptRevealed, setTranscriptRevealed] = useState(false);
  const sentences = toQuestionSentenceViewModels(detail);
  const hasHiddenTranscript = sentences.some(
    (sentence) => sentence.hiddenInitially,
  );

  return (
    <article className='grid gap-section'>
      <header className='flex flex-wrap items-center justify-between gap-cluster'>
        <h1 className='text-title text-primary'>
          {detail.questionType.displayName}
        </h1>
        <SavedQuestionButton
          onConfirmed={onSavedConfirmed}
          questionId={detail.questionId}
          saved={detail.saved}
        />
      </header>
      {sentences.map((sentence) => (
        <section
          className='grid gap-cluster rounded-panel border border-default p-page'
          key={sentence.id}
        >
          {/* 계약 대본을 인접 제공하므로 VTT endpoint가 없는 audio 규칙만 제한한다. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            src={sentence.audioUrl}
          />
          {!sentence.hiddenInitially || transcriptRevealed ? (
            <>
              <p
                className='font-thai text-title text-primary'
                lang='th'
              >
                {sentence.originalText}
              </p>
              <p className='text-body text-subtle'>{sentence.translationKo}</p>
            </>
          ) : null}
        </section>
      ))}
      {hasHiddenTranscript && !transcriptRevealed ? (
        <Button
          onClick={() => {
            setTranscriptRevealed(true);
          }}
          type='button'
          variant='outline'
        >
          대본 보기
        </Button>
      ) : null}
      <SubmitAnswerForm
        options={detail.options.map((option) => ({
          id: option.id,
          label: option.sentence.originalText,
        }))}
        questionId={detail.questionId}
        questionVersionId={detail.questionVersionId}
      />
    </article>
  );
}
