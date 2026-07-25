/** 공개 root 경로의 최소 route shell을 정의한다 */
import { createFileRoute } from '@tanstack/react-router';

/** 제품 Page 연결 전 root 경로를 route tree에 등록한다 */
export const Route = createFileRoute('/')({
  component: RootIndexRoute,
});

function RootIndexRoute() {
  return null;
}
