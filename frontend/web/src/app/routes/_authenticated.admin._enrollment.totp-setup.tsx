/** 관리자 enrollment shell의 승인된 TOTP setup 자식 route를 등록한다 */
import { createFileRoute } from '@tanstack/react-router';

/** Task 7 Page 연결 전 route generator 충돌을 막는 빈 route shell */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrollment/totp-setup',
)({
  component: TotpSetupRoute,
});

function TotpSetupRoute() {
  return null;
}
