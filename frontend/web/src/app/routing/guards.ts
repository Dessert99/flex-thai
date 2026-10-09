/** 인증 상태별 pathless route 접근을 제한한다 */
import type { AnyRouter, ParsedLocation } from '@tanstack/react-router';
import { redirect } from '@tanstack/react-router';
import type { AuthSessionState } from '@/shared/apis/auth/authSessionStore';
import { parseSafeRedirect } from './redirectSearch';

/** 인증 완료 상태에서 route guard가 공유하는 session */
export type AuthenticatedSession = Extract<
  AuthSessionState,
  { status: 'authenticated' }
>;

/** 익명 사용자를 안전한 원래 경로와 함께 로그인으로 보낸다 */
export function requireAuthenticated(
  state: AuthSessionState,
  location: ParsedLocation,
): AuthenticatedSession {
  if (state.status === 'authenticated') {
    return state;
  }

  const preservedPath = parseSafeRedirect(location.href);
  return throwLoginRedirect(preservedPath);
}

function throwLoginRedirect(preservedPath: string | undefined): never {
  redirect<AnyRouter, '/login'>({
    to: '/login',
    search: preservedPath === undefined ? {} : { redirect: preservedPath },
    throw: true,
  });
  throw new Error('로그인 redirect를 생성하지 못했습니다.');
}

/** 인증된 학습자와 관리자가 learner portal을 함께 사용하게 한다 */
export function requireLearnerPortal(session: AuthenticatedSession): void {
  void session;
}
