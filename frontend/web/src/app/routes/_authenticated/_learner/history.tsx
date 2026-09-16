/** 학습자의 원시 풀이 기록 Page를 `/history`에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { LearningHistoryPageContainer } from '@/pages/learning-history';

/** 학습자 guard 아래에서 이력 Page를 렌더링한다 */
export const Route = createFileRoute('/_authenticated/_learner/history')({
  component: LearningHistoryPageContainer,
});
