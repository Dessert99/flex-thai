/** 공개 root 경로를 인증 사용자의 공통 학습 홈로 보낸다 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import type { AuthSessionState } from '@/shared/apis/auth/authSessionStore';

const getRootDestination = (state: AuthSessionState): '/learn' | '/login' => {
  if (state.status !== 'authenticated') return '/login';
  return '/learn';
};

/** 익명은 로그인으로, 인증된 사용자는 공통 학습 홈으로 보낸다 */
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    const state = context.authSessionStore.getSnapshot();
    redirect({ replace: true, throw: true, to: getRootDestination(state) });
  },
});
