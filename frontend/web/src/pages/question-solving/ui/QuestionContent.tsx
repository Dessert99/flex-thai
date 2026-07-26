/** 문제 block·대화·듣기 대본과 문장별 주석을 구조적으로 렌더링한다 */
import { InteractiveThaiSentence } from '@/features/explore-thai-content';
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

  return (
    <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid gap-section">
        {blocks.map((block) => (
          <section
            className="grid gap-cluster rounded-panel border border-default p-page"
            key={block.id}
          >
            {block.sentences.map(({ position, sentence, speaker }) => {
              const transcriptHidden =
                block.displayMode === 'AUDIO_THEN_REVEAL' &&
                !transcriptRevealed;

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
                    <strong className="text-body text-primary">
                      {speaker}
                    </strong>
                  ) : null}
                  <div className="grid gap-cluster">
                    {sentence.audioUrl === null ? null : (
                      // 계약 대본을 인접 제공하므로 VTT endpoint가 없는 audio 규칙만 제한한다.
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio controls src={sentence.audioUrl} />
                    )}
                    {transcriptHidden ? null : (
                      <>
                        <InteractiveThaiSentence sentence={sentence} />
                        <p className="text-body text-subtle">
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

      <aside
        aria-label="문장별 주석"
        className="hidden rounded-panel border border-default p-page lg:block"
      >
        <SentenceAnnotations sentences={sentences} />
      </aside>

      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline">
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
            <div className="p-page">
              <SentenceAnnotations sentences={sentences} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

interface SentenceAnnotationsProps {
  sentences: readonly QuestionBlockViewModel['sentences'][number][];
}

function SentenceAnnotations({ sentences }: SentenceAnnotationsProps) {
  return (
    <ol className="grid gap-cluster">
      {sentences.map(({ sentence }, index) => (
        <li className="grid gap-1" key={`${sentence.sentenceVersionId}-${index}`}>
          <SentenceAudioButton
            audioUrl={sentence.audioUrl}
            label={`${index + 1}번 문장 뜻과 발음 듣기`}
          />
          <p lang="th">{sentence.originalText}</p>
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
}: {
  audioUrl: string | null;
  label: string;
}) {
  return (
    <Button
      disabled={audioUrl === null}
      onClick={() => {
        if (audioUrl !== null) {
          void new Audio(audioUrl).play();
        }
      }}
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  );
}
