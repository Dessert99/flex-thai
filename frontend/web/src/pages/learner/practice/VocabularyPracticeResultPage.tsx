import { useVocabularyPracticeResult } from '@/features/learning/hooks/vocabulary-practice-result/useVocabularyPracticeResult';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type {
  PracticeCard,
  PracticeMode,
  VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts/learning/vocabulary-practice';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function VocabularyPracticeResultPage(
  pageInput: Parameters<typeof useVocabularyPracticeResult>[0],
) {
  const { onContinue, session } = useVocabularyPracticeResult(pageInput);

  if (session.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>
              연습 결과를 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );
  }

  if (session.isError || session.data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>연습 결과를 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void session.refetch()}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  if (session.data.status === 'ACTIVE')
    return (
      <Container className='max-w-content flex-1'>
        <>null</>
      </Container>
    );

  return (
    <Container className='max-w-content flex-1'>
      <>
        <VocabularyPracticeResultContent
          onContinue={onContinue}
          session={session.data}
        />
      </>
    </Container>
  );
}
/** 완료된 단어 연습의 서버 집계와 오답 카드만 표시한다 */

const modeLabels: Record<PracticeMode, string> = {
  THAI_TO_MEANING: '태국어 → 뜻',
  MEANING_TO_THAI: '뜻 → 태국어',
};

/** 계약에 포함된 완료 결과를 별도 추정 없이 표시한다 */
export function VocabularyPracticeResultContent({
  onContinue,
  session,
}: {
  onContinue: (sessionId: string) => void;
  session: VocabularyPracticeSessionResponse;
}) {
  if (session.status !== 'COMPLETED') {
    return (
      <section className='grid gap-cluster'>
        <p>아직 완료되지 않은 연습입니다.</p>
        <Button
          onClick={() => onContinue(session.id)}
          type='button'
        >
          연습으로 돌아가기
        </Button>
      </section>
    );
  }
  return (
    <section className='grid gap-section'>
      <h1>단어 연습 결과</h1>
      <div>
        <p>정답 {session.result.total.correct}개</p>
        <p>오답 {session.result.total.incorrect}개</p>
      </div>
      <ul>
        {session.result.byMode.map((count) => (
          <li key={count.mode}>
            {modeLabels[count.mode]} · 정답 {count.correct}개 · 오답{' '}
            {count.incorrect}개
          </li>
        ))}
      </ul>
      <section className='grid gap-cluster'>
        <h2>다시 볼 단어</h2>
        {session.result.incorrectCards.length === 0 ? (
          <p>다시 볼 단어가 없습니다.</p>
        ) : (
          session.result.incorrectCards.map((card) => (
            <ResultCardView
              card={card}
              key={card.id}
            />
          ))
        )}
      </section>
    </section>
  );
}

function ResultCardView({ card }: { card: PracticeCard }) {
  return (
    <article className='grid gap-cluster rounded-panel border border-default p-page'>
      <h3
        className='font-thai text-heading'
        lang='th'
      >
        {card.thai}
      </h3>
      {card.meanings.map((meaning) => (
        <p key={meaning.id}>
          {meaning.meaningKo} · {meaning.partOfSpeech}
          {meaning.contextNote === null ? '' : ` · ${meaning.contextNote}`}
        </p>
      ))}
    </article>
  );
}
