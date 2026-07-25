/** 학습자 전용 pathless portal 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireLearnerPortal } from '../routing/guards';

/** 인증 부모 session의 learner role을 하위 route보다 먼저 검증한다 */
export const Route = createFileRoute('/_authenticated/_learner')({
  beforeLoad: ({ context }) => {
    requireLearnerPortal(context.session);
  },
  component: LearnerPortalRoute,
});

function LearnerPortalRoute() {
  return <Outlet />;
}
