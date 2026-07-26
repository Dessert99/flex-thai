/** access token을 메모리에만 보관하는 인증 세션 store를 제공한다 */
import type {
  AuthenticatedResponse,
  LoginInput,
  LoginResponse,
  MeResponse,
  ProblemDetailsResponse,
  TotpSetupResponse,
  TotpSetupVerifyInput,
} from '@flex-thia/contracts';
import { isApiError } from '../ApiError';
import {
  requestLogin,
  requestLoginTotp,
  requestLogout,
  requestMe,
  requestRefresh,
  requestTotpSetup,
  requestTotpSetupVerification,
  confirmEmailLink,
  resendEmailChallenge,
  startEmailAuthentication,
  verifyEmailCode,
} from './authApi';
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
let loginChallenge: { email: string; challengeToken: string } | undefined;
let pendingEmailChallenge: PendingEmailChallenge | undefined;
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

/** 로그인 성공을 세션에 반영하거나 TOTP challenge를 메모리에만 보관한다 */
export async function loginSession(
  input: LoginInput,
): Promise<LoginSessionResult> {
  const response = await requestLogin(input);
  return acceptLoginResponse(response);
}

/** 진행 중 이메일 challenge의 메모리 상태 */
export interface PendingEmailChallenge {
  challengeId: string;
  email: string;
  expiresAt: string;
  resendAt: string;
}

/** password 없이 이메일 challenge를 시작하고 메모리에만 보관한다 */
export async function startEmailAuthenticationSession(
  email: string,
): Promise<PendingEmailChallenge> {
  const challenge = await startEmailAuthentication(email);
  pendingEmailChallenge = { ...challenge, email };
  return pendingEmailChallenge;
}

/** 현재 탭에서 진행 중인 이메일 challenge만 반환한다 */
export function getPendingEmailChallenge():
  | PendingEmailChallenge
  | undefined {
  return pendingEmailChallenge;
}

/** 메모리 challenge의 6자리 code를 인증 응답으로 교환한다 */
export async function verifyEmailCodeSession(
  code: string,
): Promise<LoginSessionResult> {
  if (!pendingEmailChallenge) {
    throw new Error('진행 중인 이메일 challenge가 없습니다.');
  }
  const response = await verifyEmailCode(
    pendingEmailChallenge.challengeId,
    code,
  );
  pendingEmailChallenge = undefined;
  return acceptLoginResponse(response);
}

/** 명시적 link 확인 POST 결과를 fresh-page MFA 메모리 상태로 연결한다 */
export async function confirmEmailLinkSession(
  challengeId: string,
  token: string,
): Promise<LoginSessionResult> {
  const response = await confirmEmailLink(challengeId, token);
  pendingEmailChallenge = undefined;
  return acceptLoginResponse(response);
}

/** 현재 challenge를 서버에서 원자 교체하고 메모리 시각을 갱신한다 */
export async function resendPendingEmailChallenge(): Promise<PendingEmailChallenge> {
  if (!pendingEmailChallenge) {
    throw new Error('진행 중인 이메일 challenge가 없습니다.');
  }
  const challenge = await resendEmailChallenge(
    pendingEmailChallenge.challengeId,
  );
  pendingEmailChallenge = {
    ...challenge,
    email: pendingEmailChallenge.email,
  };
  return pendingEmailChallenge;
}

/** 저장된 로그인 challenge로 TOTP 인증을 완료한다 */
export async function completeLoginTotpSession(
  code: string,
): Promise<AuthenticatedLoginResult> {
  if (loginChallenge === undefined) {
    throw new Error('로그인 TOTP challenge가 없습니다.');
  }

  const response = await requestLoginTotp({
    ...loginChallenge,
    code,
  });
  if (response.status !== 'AUTHENTICATED') {
    throw new Error('로그인 TOTP challenge가 완료되지 않았습니다.');
  }

  loginChallenge = undefined;
  acceptAuthenticatedResponse(response);
  return { status: 'authenticated', user: response.user };
}

/** reload 뒤에도 사용할 로그인 TOTP challenge가 메모리에 있는지 확인한다 */
export function hasLoginTotpChallenge(): boolean {
  return loginChallenge !== undefined;
}

/** 인증된 관리자 세션으로 TOTP enrollment secret을 요청한다 */
export function beginTotpSetup(): Promise<TotpSetupResponse> {
  return runWithAccessToken(requestTotpSetup);
}

/** TOTP enrollment 확인 결과를 현재 사용자 snapshot에 반영한다 */
export async function verifyTotpSetup(
  input: TotpSetupVerifyInput,
): Promise<MeResponse> {
  const user = await runWithAccessToken((token) =>
    requestTotpSetupVerification(token, input),
  );
  if (sessionState.status === 'authenticated') {
    publish({ ...sessionState, user });
  }
  return user;
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

/** 로그인 UI가 분기할 수 있는 token 비노출 인증 완료 결과 */
export interface AuthenticatedLoginResult {
  status: 'authenticated';
  user: MeResponse;
}

/** 로그인 UI가 분기할 수 있는 token·challenge 비노출 결과 */
export type LoginSessionResult =
  AuthenticatedLoginResult | { status: 'mfa-required' };

function acceptLoginResponse(
  response: LoginResponse,
): LoginSessionResult {
  if (response.status === 'MFA_REQUIRED') {
    loginChallenge = {
      email: response.email,
      challengeToken: response.challengeToken,
    };
    return { status: 'mfa-required' };
  }

  loginChallenge = undefined;
  acceptAuthenticatedResponse(response);
  return { status: 'authenticated', user: response.user };
}

function acceptAuthenticatedResponse(response: AuthenticatedResponse): void {
  const expiresAt = Date.now() + response.expiresIn * 1_000;
  accessToken = response.accessToken;
  publish({ status: 'authenticated', user: response.user, expiresAt });
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
