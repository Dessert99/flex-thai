/** 정답 비노출 문제 상세와 사용자 제어 대본·답안 행동을 조합한다 */
import { InteractiveThaiSentence } from '@/features/learning/components/explore-thai-content/InteractiveThaiSentence';
import { ContentErrorReportDialog } from '@/features/learning/components/report-content-error/ContentErrorReportDialog';
import { SubmitAnswerForm } from '@/features/learning/components/submit-answer/SubmitAnswerForm';
import { SavedQuestionButton } from '@/features/learning/components/toggle-saved-question/SavedQuestionButton';
import { Button } from '@/shared/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/sheet';
import type {
  QuestionDetailResponse,
  SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts/learning/questions';
import { useState } from 'react';
import {
  type QuestionBlockViewModel,
  toQuestionBlockViewModels,
} from '../../libs/question-solving/questionViewModel';

interface QuestionSolvingPageViewProps {
  detail: QuestionDetailResponse;
  onSavedConfirmed: () => void;
}

/** 대본은 사용자 공개 뒤에만 렌더링하고 정답은 제출 Feature에 맡긴다 */
export function QuestionSolvingPageView({
  detail,
  onSavedConfirmed,
}: QuestionSolvingPageViewProps) {
  const [submission, setSubmission] = useState<SubmitQuestionAttemptResponse>();
  const blocks = toQuestionBlockViewModels(detail);

  return (
    <article className='grid gap-section'>
      <header className='flex flex-wrap items-center justify-between gap-cluster'>
        <h1 className='text-title text-primary'>
          {detail.questionType.displayName}
        </h1>
        <div className='flex flex-wrap items-center gap-cluster'>
          <ContentErrorReportDialog
            origin={{
              kind: 'QUESTION',
              questionId: detail.questionId,
              questionVersionId: detail.questionVersionId,
              blockId: null,
              sentenceVersionId: null,
            }}
            preview={{
              title: detail.questionType.displayName,
              metadata: `문제 ${detail.questionId}`,
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
      <QuestionContent
        blocks={blocks}
        questionId={detail.questionId}
        questionVersionId={detail.questionVersionId}
      />

      <SubmitAnswerForm
        inlineSentences={detail.blocks
          .filter((block) => block.kind === 'QUESTION')
          .flatMap((block) => block.sentences.map(({ sentence }) => sentence))}
        onConfirmed={(response) => {
          setSubmission(response);
        }}
        onReset={() => {
          setSubmission(undefined);
        }}
        options={detail.options.map((option) =>
          option.sentence === null
            ? {
                id: option.id,
                label: null,
                span: option.span,
              }
            : {
                id: option.id,
                label: option.sentence.originalText,
                span: null,
              },
        )}
        questionId={detail.questionId}
        questionVersionId={detail.questionVersionId}
      />
      {submission === undefined ? null : (
        <section className='grid gap-cluster'>
          <h2 className='text-title text-primary'>해설</h2>
          <QuestionContent
            blocks={toExplanationBlockViewModels(submission)}
            questionId={detail.questionId}
            questionVersionId={detail.questionVersionId}
          />
        </section>
      )}
    </article>
  );
}

function toExplanationBlockViewModels(
  response: SubmitQuestionAttemptResponse,
): QuestionBlockViewModel[] {
  return [...response.feedback.explanationBlocks]
    .sort((left, right) => left.position - right.position)
    .map((block) => ({
      id: block.id,
      kind: block.kind,
      position: block.position,
      sentences: [...block.sentences].sort(
        (left, right) => left.position - right.position,
      ),
    }));
}

interface QuestionContentProps {
  blocks: readonly QuestionBlockViewModel[];
  questionId: string;
  questionVersionId: string;
}

/** 문제 block의 순서와 대본 공개 정책을 보존해 표시한다 */
function QuestionContent({
  blocks,
  questionId,
  questionVersionId,
}: QuestionContentProps) {
  const sentences = blocks.flatMap((block) => block.sentences);

  return (
    <div className='grid gap-section lg:grid-cols-[minmax(0,1fr)_18rem]'>
      <QuestionBlocks
        blocks={blocks}
        questionId={questionId}
        questionVersionId={questionVersionId}
      />

      <aside
        aria-label='문장별 주석'
        className='hidden rounded-panel border border-default p-page lg:block'
      >
        <SentenceAnnotations sentences={sentences} />
      </aside>

      <div className='lg:hidden'>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type='button'
              variant='outline'
            >
              문장별 주석 열기
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>문장별 주석</SheetTitle>
              <SheetDescription>
                문제 문장의 뜻과 발음을 확인하세요.
              </SheetDescription>
            </SheetHeader>
            <div className='p-page'>
              <SentenceAnnotations sentences={sentences} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

function QuestionBlocks({
  blocks,
  questionId,
  questionVersionId,
}: QuestionContentProps) {
  return (
    <div className='grid gap-section'>
      {blocks.map((block) => (
        <section
          className='grid gap-cluster rounded-panel border border-default p-page'
          key={block.id}
        >
          <ContentErrorReportDialog
            origin={{
              kind: 'QUESTION',
              questionId,
              questionVersionId,
              blockId: block.id,
              sentenceVersionId: null,
            }}
            preview={{
              title: '문제 블록',
              metadata: `블록 ${block.id}`,
            }}
            triggerLabel='문제 블록 오류 신고'
          />
          {block.sentences.map(({ position, sentence, speaker }) => {
            return (
              <div
                className={
                  block.kind === 'DIALOGUE'
                    ? 'grid grid-cols-[2rem_minmax(0,1fr)] gap-cluster'
                    : 'grid gap-cluster'
                }
                key={`${sentence.sentenceVersionId}-${position}`}
              >
                {block.kind === 'DIALOGUE' ? (
                  <strong className='text-body text-primary'>{speaker}</strong>
                ) : null}
                <div className='grid gap-cluster'>
                  (
                  <>
                    <InteractiveThaiSentence sentence={sentence} />
                    <p className='text-body text-subtle'>
                      {sentence.translationKo}
                    </p>
                  </>
                  )
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

interface SentenceAnnotationsProps {
  sentences: readonly QuestionBlockViewModel['sentences'][number][];
}

function SentenceAnnotations({ sentences }: SentenceAnnotationsProps) {
  return (
    <ol className='grid gap-cluster'>
      {sentences.map(({ sentence }, index) => (
        <li
          className='grid gap-cluster'
          key={`${sentence.sentenceVersionId}-${index}`}
        >
          <p>{index + 1}번 문장</p>
          <p lang='th'>{sentence.originalText}</p>
          <p>{sentence.translationKo}</p>
          <p>{sentence.pronunciationKo}</p>
          <p>{sentence.toneMarks}</p>
        </li>
      ))}
    </ol>
  );
}
