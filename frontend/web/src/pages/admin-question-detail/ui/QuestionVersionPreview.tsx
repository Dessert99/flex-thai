/** 관리자 문제 버전을 실제 풀이 순서의 접근 가능한 preview로 표현한다 */
import type { AdminQuestionDetailResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';

type Version = AdminQuestionDetailResponse['versions'][number];

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
            <article
              className='grid gap-cluster'
              key={`${sentence.id}-${position}`}
            >
              {speaker ? <p className='text-caption'>{speaker}</p> : null}
              <p
                className='text-title'
                lang='th'
              >
                {sentence.originalText}
              </p>
              <p className='text-body'>{sentence.translationKo}</p>
              <p className='text-caption text-subtle'>
                {sentence.pronunciationKo} ·{' '}
                {sentence.toneMarks || '성조 표기 없음'}
              </p>
              {sentence.audio.status === 'READY' ? (
                <a
                  className='w-fit text-body text-primary underline'
                  href={sentence.audio.readUrl}
                >
                  문장 음성 듣기
                </a>
              ) : (
                <span className='text-caption text-subtle'>
                  음성 {sentence.audio.status}
                </span>
              )}
            </article>
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
            sentences.map(({ sentence }) => (
              <article key={sentence.id}>
                <p lang='th'>{sentence.originalText}</p>
                <p className='text-body text-subtle'>
                  {sentence.translationKo}
                </p>
              </article>
            )),
          )}
        </section>
      ) : null}
    </section>
  );
}
