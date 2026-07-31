/** 인증·역할·관리자 TOTP enrollment 접근 경계를 검증한다 */
import type { ParsedLocation } from '@tanstack/react-router';
import { isRedirect } from '@tanstack/react-router';
import type { MeResponse } from '@flex-thia/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '@/shared/api';
import {
  requireAdminEnrollment,
  requireAdminPortal,
  requireAuthenticated,
  requireLearnerPortal,
} from './guards';

const learner = createSession({
  role: 'LEARNER',
  mfaEnrolled: false,
});
const unenrolledAdmin = createSession({
  role: 'ADMIN',
  mfaEnrolled: false,
});
const enrolledAdmin = createSession({
  role: 'ADMIN',
  mfaEnrolled: true,
});

describe('route 접근 guard', () => {
  it('익명 사용자를 현재 내부 경로와 함께 로그인으로 보낸다', () => {
    const state: AuthSessionState = {
      status: 'anonymous',
      reason: 'missing-session',
    };

    const thrown = captureThrown(() =>
      requireAuthenticated(state, createLocation('/questions?page=2')),
    );

    expect(isRedirect(thrown)).toBe(true);
    expectRedirect(thrown, '/login', {
      redirect: '/questions?page=2',
    });
  });

  it('학습자가 관리자 영역에 접근하면 학습 홈으로 보낸다', () => {
    const thrown = captureThrown(() => requireAdminPortal(learner));

    expectRedirect(thrown, '/learn');
  });

  it('TOTP 미등록 관리자를 enrollment 영역으로 보낸다', () => {
    const thrown = captureThrown(() => requireAdminPortal(unenrolledAdmin));

    expectRedirect(thrown, '/admin/totp-setup');
  });

  it('TOTP 등록 관리자의 enrollment 접근을 관리자 홈으로 보낸다', () => {
    const thrown = captureThrown(() => requireAdminEnrollment(enrolledAdmin));

    expectRedirect(thrown, '/admin');
  });

  it('TOTP 등록 여부와 무관하게 관리자가 학습자 portal을 사용할 수 있다', () => {
    expect(() => requireLearnerPortal(unenrolledAdmin)).not.toThrow();
    expect(() => requireLearnerPortal(enrolledAdmin)).not.toThrow();
  });

  it('부모 guard 실패 뒤 leaf loader를 실행하지 않는다', () => {
    const leafLoader = vi.fn();
    const state: AuthSessionState = {
      status: 'anonymous',
      reason: 'expired',
    };

    expect(() => {
      requireAuthenticated(state, createLocation('/admin'));
      leafLoader();
    }).toThrow();
    expect(leafLoader).not.toHaveBeenCalled();
  });
});

function createSession(userOverride: Pick<MeResponse, 'role' | 'mfaEnrolled'>) {
  return {
    status: 'authenticated',
    expiresAt: Date.now() + 3_600_000,
    user: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
      email: 'user@example.com',
      ...userOverride,
    },
  } as const;
}

function createLocation(href: string): ParsedLocation {
  const url = new URL(href, 'https://flex-thia.test');

  return {
    external: false,
    hash: url.hash.slice(1),
    href,
    pathname: url.pathname,
    publicHref: href,
    search: Object.fromEntries(url.searchParams),
    searchStr: url.search,
    state: { __TSR_index: 0 },
  };
}

function captureThrown(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error('redirect가 발생하지 않았습니다.');
}

function expectRedirect(
  value: unknown,
  to: string,
  search?: Record<string, string>,
): void {
  expect(isRedirect(value)).toBe(true);
  if (!isRedirect(value)) {
    return;
  }

  expect(value.options).toMatchObject({
    to,
    ...(search === undefined ? {} : { search }),
  });
}
