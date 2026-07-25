/** 인증·role·관리자 TOTP 상태별 pathless route 접근을 제한한다 */
import type { AnyRouter, ParsedLocation } from '@tanstack/react-router';
import { redirect } from '@tanstack/react-router';
import type { AuthSessionState } from '@/shared/api';
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

/** learner portal을 학습자에게만 허용한다 */
export function requireLearnerPortal(session: AuthenticatedSession): void {
  if (session.user.role === 'LEARNER') {
    return;
  }

  return throwAccessRedirect(
    session.user.mfaEnrolled ? '/admin' : '/admin/totp-setup',
  );
}

/** 관리자 TOTP enrollment 영역을 미등록 관리자에게만 허용한다 */
export function requireAdminEnrollment(session: AuthenticatedSession): void {
  if (session.user.role === 'LEARNER') {
    return throwAccessRedirect('/learn');
  }
  if (session.user.mfaEnrolled) {
    return throwAccessRedirect('/admin');
  }
}

/** enrolled 관리자 portal을 TOTP 등록 관리자에게만 허용한다 */
export function requireAdminPortal(session: AuthenticatedSession): void {
  if (session.user.role === 'LEARNER') {
    return throwAccessRedirect('/learn');
  }
  if (!session.user.mfaEnrolled) {
    return throwAccessRedirect('/admin/totp-setup');
  }
}

function throwAccessRedirect(
  to: '/learn' | '/admin' | '/admin/totp-setup',
): never {
  redirect({ throw: true, to });
  throw new Error('접근 경계 redirect를 생성하지 못했습니다.');
}
