/** 관리자 사용자 관리 Page를 등록한다 */
import { createFileRoute } from '@tanstack/react-router';
import { UserManagementPage } from '@/pages/user-management';

/** 등록된 관리자 guard 아래에서 사용자 관리를 렌더링한다 */
export const Route = createFileRoute('/_authenticated/admin/_enrolled/users')({
  component: UserManagementPage,
});
