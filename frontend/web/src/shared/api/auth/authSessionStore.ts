/** access token을 메모리에만 보관하는 인증 세션 store를 제공한다 */
import type {
  AuthenticatedResponse,
  MeResponse,
  ProblemDetailsResponse,
} from '@flex-thia/contracts';
import { isApiError } from '../ApiError';
import { requestLogout, requestMe, requestRefresh } from './authApi';
import {
  clearSessionRefresh,
  runSessionRefresh,
  scheduleSessionRefresh,
} from './sessionRefreshCoordinator';

/** 화면과 route guard가 관찰할 수 있는 인증 세션 상태 */
export type AuthSessionState =
  | { status: 'restoring' }
  | {
      status: 'anonymous';
      reason: 'missing-session' | 'expired' | 'logged-out';
    }
  | {
      status: 'authenticated';
      user: MeResponse;
      expiresAt: number;
    }
  | {
      status: 'blocked';
      reason: 'account-disabled';
      requestId?: string;
    }
  | {
      status: 'restore-error';
      reason: 'csrf' | 'network' | 'server';
      requestId?: string;
    };

/** React가 useSyncExternalStore로 구독할 수 있는 세션 store */
export interface AuthSessionStore {
  getSnapshot(): AuthSessionState;
  subscribe(listener: () => void): () => void;
}

type RefreshContext = 'restore' | 'refresh';

let accessToken: string | undefined;
let sessionState: AuthSessionState = { status: 'restoring' };
const listeners = new Set<() => void>();

/** 현재 인증 세션 snapshot을 구독 가능한 형태로 공개한다 */
export const authSessionStore: AuthSessionStore = {
  getSnapshot() {
    return sessionState;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** refresh와 /me를 차례로 검증해 최초 세션을 복원한다 */
export async function restoreSession(): Promise<void> {
  publish({ status: 'restoring' });
  await runSessionRefresh(() => reconcileSession('restore'));
}

/** 모든 호출자가 공유하는 refresh로 현재 세션을 갱신한다 */
export async function refreshSession(): Promise<void> {
  await runSessionRefresh(() => reconcileSession('refresh'));
}

/** 서버 logout 성공 뒤 메모리 token과 사용자 snapshot을 제거한다 */
export async function logoutSession(): Promise<void> {
  await requestLogout();
  accessToken = undefined;
  publish({ status: 'anonymous', reason: 'logged-out' });
}

/** token 원문을 노출하지 않고 인증된 callback만 실행한다 */
export function runWithAccessToken<T>(
  operation: (token: string) => Promise<T>,
): Promise<T> {
  if (accessToken === undefined || sessionState.status !== 'authenticated') {
    throw new Error('인증된 세션이 필요합니다.');
  }

  return operation(accessToken);
}

/** account-disabled 403을 즉시 terminal blocked 상태로 반영한다 */
export function reflectAuthenticatedError(error: unknown): void {
  const problem = getProblem(error);

  if (problem?.code === 'ACCOUNT_DISABLED') {
    accessToken = undefined;
    publish(withRequestId('blocked', problem.requestId));
  }
}

/** replay가 다시 401을 받으면 세션을 만료한다 */
export function expireSession(): void {
  accessToken = undefined;
  publish({ status: 'anonymous', reason: 'expired' });
}

async function reconcileSession(context: RefreshContext): Promise<void> {
  try {
    const refreshed = await requestRefresh();
    const reconciledUser = await requestMe(refreshed.accessToken);
    acceptRefreshedSession(refreshed, reconciledUser);
  } catch (error) {
    accessToken = undefined;
    publish(classifyRefreshFailure(error, context));
  }
}

function acceptRefreshedSession(
  refreshed: AuthenticatedResponse,
  user: MeResponse,
): void {
  const expiresAt = Date.now() + refreshed.expiresIn * 1_000;
  accessToken = refreshed.accessToken;
  publish({ status: 'authenticated', user, expiresAt });
}

function publish(nextState: AuthSessionState): void {
  sessionState = nextState;

  if (nextState.status === 'authenticated') {
    scheduleSessionRefresh(nextState.expiresAt, refreshSession);
  } else {
    clearSessionRefresh();
  }

  for (const listener of listeners) {
    listener();
  }
}

function classifyRefreshFailure(
  error: unknown,
  context: RefreshContext,
): AuthSessionState {
  const problem = getProblem(error);

  if (problem !== undefined) {
    return classifyProblemFailure(problem, context);
  }
  if (
    isApiError(error) &&
    (error.detail.kind === 'network' || error.detail.kind === 'timeout')
  ) {
    return { status: 'restore-error', reason: 'network' };
  }

  return withRequestId('server', undefined);
}

function classifyProblemFailure(
  problem: ProblemDetailsResponse,
  context: RefreshContext,
): AuthSessionState {
  if (problem.code === 'ACCOUNT_DISABLED') {
    return withRequestId('blocked', problem.requestId);
  }
  if (problem.status === 401) {
    return {
      status: 'anonymous',
      reason: context === 'restore' ? 'missing-session' : 'expired',
    };
  }
  if (problem.status === 403) {
    return withRequestId('csrf', problem.requestId);
  }

  return withRequestId('server', problem.requestId);
}

function getProblem(error: unknown) {
  return isApiError(error) && error.detail.kind === 'problem'
    ? error.detail.problem
    : undefined;
}

function withRequestId(
  kind: 'blocked' | 'csrf' | 'server',
  requestId: string | undefined,
): AuthSessionState {
  if (kind === 'blocked') {
    return {
      status: 'blocked',
      reason: 'account-disabled',
      ...(requestId === undefined ? {} : { requestId }),
    };
  }

  return {
    status: 'restore-error',
    reason: kind,
    ...(requestId === undefined ? {} : { requestId }),
  };
}
