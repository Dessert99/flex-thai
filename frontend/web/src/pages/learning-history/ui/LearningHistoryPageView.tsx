/** 학습자의 원시 풀이 기록을 통계 없이 시간순 목록으로 표현한다 */
import type { QuestionAttemptListResponse } from '@flex-thia/contracts';
import { formatLocalDateTime } from '@/shared/lib/date';

interface LearningHistoryPageViewProps {
  attempts: QuestionAttemptListResponse['items'];
}

/** 시도 번호·정오답·원본 datetime을 그대로 보존해 표시한다 */
export function LearningHistoryPageView({
  attempts,
}: LearningHistoryPageViewProps) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>오답 기록</h1>
      <ul className='grid gap-cluster'>
        {attempts.map((attempt) => (
          <li
            className='grid gap-cluster rounded-panel border border-default bg-surface p-page'
            key={attempt.id}
          >
            <a
              className='text-body text-primary'
              href={`/questions/${attempt.questionId}`}
            >
              {attempt.attemptNo}번째 시도
            </a>
            <span className='text-body text-subtle'>
              {attempt.isCorrect ? '정답' : '오답'}
            </span>
            <time
              className='text-caption text-subtle'
              dateTime={attempt.submittedAt}
            >
              {formatLocalDateTime(attempt.submittedAt)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
