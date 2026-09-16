/** 관리자 문제 버전을 실제 풀이 순서의 접근 가능한 preview로 표현한다 */
import { Badge } from '@/shared/components/badge';
import type { AdminQuestionDetailResponse } from '@flex-thia/contracts/admin/questions';

type Version = AdminQuestionDetailResponse['versions'][number];
type Sentence = Version['blocks'][number]['sentences'][number]['sentence'];

/** 본문·보기·정답·해설과 문장 학습 정보를 한 preview에 표시한다 */
export function QuestionVersionPreview({ version }: { version: Version }) {
  const contentBlocks = version.blocks.filter(
    ({ kind }) => kind !== 'EXPLANATION',
  );
  const explanationBlocks = version.blocks.filter(
    ({ kind }) => kind === 'EXPLANATION',
  );

  return (
    <section
      aria-label={`버전 ${version.version} 문제 미리보기`}
      className='grid gap-cluster rounded-panel border border-default bg-surface-muted p-page'
    >
      <h3 className='text-title text-primary'>실제 문제 미리보기</h3>
      {contentBlocks.map((block) => (
        <div
          className='grid gap-cluster'
          key={block.id}
        >
          <Badge
            className='w-fit'
            variant='outline'
          >
            {block.kind}
          </Badge>
          {block.sentences.map(({ position, sentence, speaker }) => (
            <PreviewSentence
              key={`${sentence.id}-${position}`}
              position={position}
              sentence={sentence}
              speaker={speaker}
            />
          ))}
        </div>
      ))}
      <fieldset className='grid gap-cluster'>
        <legend className='text-body text-primary'>정답 선택</legend>
        {version.options.map((option) => (
          <label
            className='flex cursor-pointer items-center gap-cluster rounded-control border border-default p-cluster'
            key={option.id}
          >
            <input
              name={`question-preview-${version.id}`}
              type='radio'
              value={option.id}
            />
            <span lang='th'>{option.displayText}</span>
            {option.id === version.correctOptionId ? (
              <Badge variant='secondary'>정답</Badge>
            ) : null}
          </label>
        ))}
      </fieldset>
      {explanationBlocks.length > 0 ? (
        <section className='grid gap-cluster'>
          <h4 className='text-body text-primary'>해설</h4>
          {explanationBlocks.flatMap(({ sentences }) =>
            sentences.map(({ position, sentence, speaker }) => (
              <PreviewSentence
                key={sentence.id}
                position={position}
                sentence={sentence}
                speaker={speaker}
              />
            )),
          )}
        </section>
      ) : null}
    </section>
  );
}

function PreviewSentence({
  position,
  sentence,
  speaker,
}: {
  position: number;
  sentence: Version['blocks'][number]['sentences'][number]['sentence'];
  speaker: string | null;
}) {
  return (
    <article
      aria-label={`문장 ${position + 1}`}
      className='grid gap-cluster'
    >
      {speaker ? <p className='text-caption'>{speaker}</p> : null}

      <SentenceText sentence={sentence} />
    </article>
  );
}

function SentenceText({ sentence }: { sentence: Sentence }) {
  return (
    <>
      <p
        className='text-title'
        lang='th'
      >
        {sentence.originalText}
      </p>
      <p className='text-body'>{sentence.translationKo}</p>
      <p className='text-caption text-subtle'>
        {sentence.pronunciationKo} · {sentence.toneMarks || '성조 표기 없음'}
      </p>
    </>
  );
}
