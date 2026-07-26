/** 정답 비노출 문제 상세와 사용자 제어 대본·답안 행동을 조합한다 */
import type { QuestionDetailResponse } from '@flex-thia/contracts';
import { useState } from 'react';
import { SubmitAnswerForm } from '@/features/submit-answer';
import { SavedQuestionButton } from '@/features/toggle-saved-question';
import { Button } from '@/shared/ui/button';
import { toQuestionBlockViewModels } from '../model/questionViewModel';
import { QuestionContent } from './QuestionContent';

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
  const blocks = toQuestionBlockViewModels(detail);
  const hasHiddenTranscript = blocks.some(
    (block) => block.displayMode === 'AUDIO_THEN_REVEAL',
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
      <QuestionContent
        blocks={blocks}
        transcriptRevealed={transcriptRevealed}
      />
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
        onConfirmed={() => {
          setTranscriptRevealed(true);
        }}
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
