/** 공개 root 경로를 현재 session의 기본 portal로 보낸다 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import type { AuthSessionState } from '@/shared/api';

const getRootDestination = (
  state: AuthSessionState,
): '/admin' | '/learn' | '/login' => {
  if (state.status !== 'authenticated') return '/login';
  if (state.user.role === 'LEARNER') return '/learn';
  return '/admin';
};

/** 익명은 로그인, 학습자는 학습 홈, 관리자는 관리자 홈으로 결정적으로 보낸다 */
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    const state = context.authSessionStore.getSnapshot();
    redirect({ replace: true, throw: true, to: getRootDestination(state) });
  },
});
