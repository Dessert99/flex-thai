/** 학습자 전용 pathless 접근 경계와 역할 shell을 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { LogoutButton } from '@/features/logout';
import { AppShell } from '@/shared/ui/app-shell';
import { requireLearnerPortal } from '../routing/guards';
import { learnerNavigation } from '../routing/learnerNavigation';

/** 인증 부모 session의 learner role을 하위 route보다 먼저 검증한다 */
export const Route = createFileRoute('/_authenticated/_learner')({
  beforeLoad: ({ context }) => {
    requireLearnerPortal(context.session);
  },
  component: LearnerPortalRoute,
});

function LearnerPortalRoute() {
  return (
    <AppShell
      navigation={learnerNavigation}
      profileMenu={<LogoutButton />}
    >
      <Outlet />
    </AppShell>
  );
}
