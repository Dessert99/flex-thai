/** 인증 접근 경계를 검증한다 */
import type { ParsedLocation } from '@tanstack/react-router';
import { isRedirect } from '@tanstack/react-router';
import type { MeResponse } from '@flex-thia/contracts/identity/auth';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '@/shared/apis/auth/authSessionStore';
import { requireAuthenticated, requireLearnerPortal } from './guards';

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
      requireAuthenticated(
        state,
        createLocation(
          '/wordbooks/01933b6a-8f13-7a19-b7e5-536d70f57aaa?page=2',
        ),
      ),
    );

    expect(isRedirect(thrown)).toBe(true);
    expectRedirect(thrown, '/login', {
      redirect: '/wordbooks/01933b6a-8f13-7a19-b7e5-536d70f57aaa?page=2',
    });
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
      requireAuthenticated(state, createLocation('/learn'));
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
