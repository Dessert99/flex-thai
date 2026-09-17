/** 외부 번역 확장에서 선택할 수 있는 일반 텍스트로 문제를 표시한다. */
import type {
  QuestionDetailResponse,
  SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts/learning/questions';
import { useState } from 'react';
import { ContentErrorReportDialog } from '../report-content-error/ContentErrorReportDialog';
import { SubmitAnswerForm } from '../submit-answer/SubmitAnswerForm';
import { SavedQuestionButton } from '../toggle-saved-question/SavedQuestionButton';
export function QuestionSolvingPageView({
  detail,
  onSavedConfirmed,
}: {
  detail: QuestionDetailResponse;
  onSavedConfirmed: () => void;
}) {
  const [submission, setSubmission] = useState<SubmitQuestionAttemptResponse>();
  return (
    <article className='grid gap-section'>
      <header className='flex flex-wrap items-center justify-between gap-cluster'>
        <h1 className='text-title text-primary'>
          {detail.questionType.displayName}
        </h1>
        <div className='flex gap-cluster'>
          <ContentErrorReportDialog
            origin={{
              kind: 'QUESTION',
              questionId: detail.questionId,
              questionVersion: detail.questionVersion,
              blockId: null,
              sentenceVersionId: null,
            }}
            preview={{
              title: detail.questionType.displayName,
              metadata: `버전 ${detail.questionVersion}`,
            }}
            triggerLabel='문제 오류 신고'
          />
          <SavedQuestionButton
            onConfirmed={onSavedConfirmed}
            questionId={detail.questionId}
            saved={detail.saved}
          />
        </div>
      </header>
      {detail.firstResult === 'UPDATED' ? (
        <p role='status'>문제가 수정되었습니다. 다시 풀어보세요.</p>
      ) : null}
      {detail.passage ? (
        <p
          lang='th'
          className='whitespace-pre-wrap font-thai text-body'
        >
          {detail.passage}
        </p>
      ) : null}
      <p
        lang='th'
        className='whitespace-pre-wrap font-thai text-body'
      >
        {detail.prompt}
      </p>
      <SubmitAnswerForm
        questionId={detail.questionId}
        questionVersion={detail.questionVersion}
        options={detail.options}
        onConfirmed={setSubmission}
        onReset={() => setSubmission(undefined)}
      />
      {submission ? (
        <section className='grid gap-cluster'>
          <h2 className='text-title'>해설</h2>
          <p className='whitespace-pre-wrap'>
            {submission.feedback.explanation}
          </p>
        </section>
      ) : null}
    </article>
  );
}
