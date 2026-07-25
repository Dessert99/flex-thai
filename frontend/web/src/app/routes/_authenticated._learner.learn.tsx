/** 학습자 pathless shell의 승인된 `/learn` 자식 route를 등록한다 */
import { createFileRoute } from '@tanstack/react-router';

/** Task 8 Page 연결 전 route generator 충돌을 막는 빈 route shell */
export const Route = createFileRoute('/_authenticated/_learner/learn')({
  component: LearnerHomeRoute,
});

function LearnerHomeRoute() {
  return null;
}
