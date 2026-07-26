/** 문제 block·대화·듣기 대본과 문장별 주석을 구조적으로 렌더링한다 */
import {
  InteractiveThaiSentence,
  useThaiAudioPlayback,
} from '@/features/explore-thai-content';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';
import type { QuestionBlockViewModel } from '../model/questionViewModel';

interface QuestionContentProps {
  blocks: readonly QuestionBlockViewModel[];
  transcriptRevealed: boolean;
}

/** 문제 block의 순서와 대본 공개 정책을 보존해 표시한다 */
export function QuestionContent({
  blocks,
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

function QuestionBlocks({ blocks, transcriptRevealed }: QuestionContentProps) {
  return (
    <div className='grid gap-section'>
      {blocks.map((block) => (
        <section
          className='grid gap-cluster rounded-panel border border-default p-page'
          key={block.id}
        >
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
