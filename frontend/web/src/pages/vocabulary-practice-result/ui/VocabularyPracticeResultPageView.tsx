/** 완료된 단어 연습의 서버 집계와 오답 카드만 표시한다 */
import type {
  PracticeCard,
  PracticeMode,
  VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import { useThaiAudioPlayback } from '@/features/explore-thai-content';
import { Button } from '@/shared/ui/button';

const modeLabels: Record<PracticeMode, string> = {
  THAI_TO_MEANING: '태국어 → 뜻',
  MEANING_TO_THAI: '뜻 → 태국어',
  AUDIO_TO_THAI: '음성 → 태국어',
  AUDIO_TO_MEANING: '음성 → 뜻',
};

/** 계약에 포함된 완료 결과를 별도 추정 없이 표시한다 */
export function VocabularyPracticeResultPageView({
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
  const { playAudio, playbackError } = useThaiAudioPlayback();
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
      {card.pronunciations.map((pronunciation) => (
        <div key={pronunciation.id}>
          <p>
            {pronunciation.pronunciationKo} · {pronunciation.toneMarks}
          </p>
          <Button
            onClick={() => void playAudio(pronunciation.audioUrl)}
            type='button'
            variant='ghost'
          >
            {pronunciation.pronunciationKo} 음성 듣기
          </Button>
        </div>
      ))}
      {playbackError === null ? null : <p role='status'>{playbackError}</p>}
    </article>
  );
}
