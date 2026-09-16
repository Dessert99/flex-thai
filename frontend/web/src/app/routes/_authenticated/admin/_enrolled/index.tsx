/** 관리자 홈 Page를 승인된 `/admin` index 경로에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { AdminHomePageContainer } from '@/pages/admin-home';

/** 관리자 홈의 서버 상태 소유 Page를 route에 연결한다 */
export const Route = createFileRoute('/_authenticated/admin/_enrolled/')({
  component: AdminHomePageContainer,
});
