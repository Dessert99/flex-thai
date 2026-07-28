/** canonical 문제 후보의 문장 block과 option만 의도적으로 렌더링한다 */
import type { QuestionCandidatePayload } from '@flex-thia/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

/** provider 원문이나 전체 JSON 없이 학습자가 보게 될 문장 필드만 보여준다 */
export function QuestionCandidateGraph({
  payload,
}: {
  payload: QuestionCandidatePayload;
}) {
  return (
    <section className='grid gap-cluster'>
      {payload.blocks.map((block, blockIndex) => (
        <Card key={`${block.kind}-${blockIndex}`}>
          <CardHeader>
            <CardTitle>
              {block.kind} · {block.displayMode}
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-cluster'>
            {block.sentences.map(({ speaker, sentence }, sentenceIndex) => (
              <article key={`${sentence.originalText}-${sentenceIndex}`}>
                {speaker ? <p>화자: {speaker}</p> : null}
                <p lang='th'>{sentence.originalText}</p>
                <p>{sentence.translationKo}</p>
                <p>{sentence.pronunciationKo}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>선택지</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-cluster'>
          {payload.options.map((option) => (
            <article key={option.clientRef}>
              <strong>
                {option.position + 1}
                {option.clientRef === payload.correctOptionRef ? ' · 정답' : ''}
              </strong>
              {option.sentence ? (
                <>
                  <p lang='th'>{option.sentence.originalText}</p>
                  <p>{option.sentence.translationKo}</p>
                </>
              ) : (
                <p>
                  본문 {option.span.blockPosition + 1}번 block의{' '}
                  {option.span.sentencePosition + 1}번 문장
                </p>
              )}
            </article>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
