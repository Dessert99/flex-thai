/** 정답 비노출 문제 상세와 사용자 제어 대본·답안 행동을 조합한다 */
import type {
  QuestionDetailResponse,
  SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { ContentErrorReportDialog } from '@/features/report-content-error';
import { SubmitAnswerForm } from '@/features/submit-answer';
import { SavedQuestionButton } from '@/features/toggle-saved-question';
import { Button } from '@/shared/ui/button';
import {
  type QuestionBlockViewModel,
  toQuestionBlockViewModels,
} from '../model/questionViewModel';
import {
  InteractiveThaiSentence,
  useThaiAudioPlayback,
} from '@/features/explore-thai-content';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';

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
  const [submission, setSubmission] = useState<SubmitQuestionAttemptResponse>();
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
        inlineSentences={detail.blocks
          .filter((block) => block.kind === 'QUESTION')
          .flatMap((block) => block.sentences.map(({ sentence }) => sentence))}
        onConfirmed={(response) => {
          setTranscriptRevealed(true);
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
            transcriptRevealed
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
      displayMode: block.displayMode,
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
  transcriptRevealed: boolean;
}

/** 문제 block의 순서와 대본 공개 정책을 보존해 표시한다 */
function QuestionContent({
  blocks,
  questionId,
  questionVersionId,
  transcriptRevealed,
}: QuestionContentProps) {
  const sentences = blocks.flatMap((block) =>
    block.displayMode === 'AUDIO_THEN_REVEAL' && !transcriptRevealed
      ? []
      : block.sentences,
  );
  const { playAudio, playbackError } = useThaiAudioPlayback();

  return (
    <div className='grid gap-section lg:grid-cols-[minmax(0,1fr)_18rem]'>
      <QuestionBlocks
        blocks={blocks}
        questionId={questionId}
        questionVersionId={questionVersionId}
        transcriptRevealed={transcriptRevealed}
      />

      <aside
        aria-label='문장별 주석'
        className='hidden rounded-panel border border-default p-page lg:block'
      >
        <SentenceAnnotations
          onPlay={playAudio}
          sentences={sentences}
        />
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
              <SentenceAnnotations
                onPlay={playAudio}
                sentences={sentences}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
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

function QuestionBlocks({
  blocks,
  questionId,
  questionVersionId,
  transcriptRevealed,
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
            const transcriptHidden =
              block.displayMode === 'AUDIO_THEN_REVEAL' && !transcriptRevealed;

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
                  {sentence.audioUrl === null ? null : (
                    // 계약 대본을 인접 제공하므로 VTT endpoint가 없는 audio 규칙만 제한한다.
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio
                      controls
                      src={sentence.audioUrl}
                    />
                  )}
                  {transcriptHidden ? null : (
                    <>
                      <InteractiveThaiSentence sentence={sentence} />
                      <p className='text-body text-subtle'>
                        {sentence.translationKo}
                      </p>
                    </>
                  )}
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
  onPlay: (audioUrl: string | null) => Promise<void>;
  sentences: readonly QuestionBlockViewModel['sentences'][number][];
}

function SentenceAnnotations({ onPlay, sentences }: SentenceAnnotationsProps) {
  return (
    <ol className='grid gap-cluster'>
      {sentences.map(({ sentence }, index) => (
        <li
          className='grid gap-cluster'
          key={`${sentence.sentenceVersionId}-${index}`}
        >
          <SentenceAudioButton
            audioUrl={sentence.audioUrl}
            label={`${index + 1}번 문장 뜻과 발음 듣기`}
            onPlay={onPlay}
          />
          <p lang='th'>{sentence.originalText}</p>
          <p>{sentence.translationKo}</p>
          <p>{sentence.pronunciationKo}</p>
        </li>
      ))}
    </ol>
  );
}

function SentenceAudioButton({
  audioUrl,
  label,
  onPlay,
}: {
  audioUrl: string | null;
  label: string;
  onPlay: (audioUrl: string | null) => Promise<void>;
}) {
  return (
    <Button
      disabled={audioUrl === null}
      onClick={() => {
        void onPlay(audioUrl);
      }}
      type='button'
      variant='ghost'
    >
      {label}
    </Button>
  );
}
