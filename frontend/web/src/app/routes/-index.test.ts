/** 공개 root가 session role에 따라 단일 portal로 redirect하는지 검증한다 */
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import type { AuthSessionState } from '@/shared/api';
import { Route } from './index';

describe('root index route', () => {
  it.each([
    [
      {
        status: 'anonymous',
        reason: 'missing-session',
      } satisfies AuthSessionState,
      '/login',
    ],
    [createSession('LEARNER'), '/learn'],
    [createSession('ADMIN'), '/admin'],
  ])('%s session을 %s 경로로 보낸다', (state, destination) => {
    const beforeLoad = Route.options.beforeLoad;
    if (typeof beforeLoad !== 'function') {
      throw new Error('root redirect beforeLoad가 필요합니다.');
    }

    const thrown = captureThrown(() =>
      beforeLoad({
        context: {
          authSessionStore: { getSnapshot: () => state },
        },
      } as never),
    );

    expect(isRedirect(thrown)).toBe(true);
    if (!isRedirect(thrown)) return;
    expect(thrown.options).toMatchObject({
      replace: true,
      to: destination,
    });
  });
});

function createSession(role: 'ADMIN' | 'LEARNER'): AuthSessionState {
  return {
    status: 'authenticated',
    expiresAt: Date.now() + 3_600_000,
    user: {
      id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
      email: `${role.toLowerCase()}@example.com`,
      role,
      mfaEnrolled: false,
    },
  };
}

function captureThrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('redirect가 발생하지 않았습니다.');
}
