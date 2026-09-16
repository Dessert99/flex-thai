/** 학습자 홈 Page를 승인된 `/learn` 경로에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { LearnerHomePage } from '@/pages/learner/LearnerHomePage';

/** 학습자 홈의 서버 상태 소유 Page를 route에 연결한다 */
export const Route = createFileRoute('/_authenticated/_learner/learn')({
  component: LearnerHomePage,
});
