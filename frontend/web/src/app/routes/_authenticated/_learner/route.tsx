/** 공통 사이드바 아래에서 접근 권한만 검사한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireLearnerPortal } from '../../../routing/guards';

export const Route = createFileRoute('/_authenticated/_learner')({
  beforeLoad: ({ context }) => {
    requireLearnerPortal(context.session);
  },
  component: Outlet,
});
