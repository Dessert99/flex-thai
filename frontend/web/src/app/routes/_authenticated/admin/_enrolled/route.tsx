/** 공통 사이드바 아래에서 접근 권한만 검사한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAdminPortal } from '../../../../routing/guards';

export const Route = createFileRoute('/_authenticated/admin/_enrolled')({
  beforeLoad: ({ context }) => {
    requireAdminPortal(context.session);
  },
  component: Outlet,
});
