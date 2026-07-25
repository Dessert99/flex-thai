/** bearer 인증 요청에 401 refresh와 최대 1회 replay를 적용한다 */
import {
  apiRequest,
  type ApiRequestOptions,
  type ResponseContract,
} from '../apiRequest';
import { isApiError } from '../ApiError';
import {
  authSessionStore,
  expireSession,
  reflectAuthenticatedError,
  refreshSession,
  runWithAccessToken,
} from './authSessionStore';

/** access token과 cookie 설정을 store 경계에 맡기는 인증 요청 옵션 */
export interface AuthenticatedRequestOptions<T> extends Omit<
  ApiRequestOptions<T>,
  'accessToken' | 'includeCredentials' | 'response'
> {
  response: ResponseContract<T>;
}

/** 401에서 한 번 refresh한 뒤 동일 요청을 최대 한 번 replay한다 */
export async function authenticatedRequest<T>(
  options: AuthenticatedRequestOptions<T>,
): Promise<T> {
  try {
    return await executeAuthenticated(options);
  } catch (error) {
    reflectAuthenticatedError(error);

    if (!shouldRefresh(error, options.path)) {
      throw error;
    }

    await refreshSession();
    if (authSessionStore.getSnapshot().status !== 'authenticated') {
      throw error;
    }

    return replayOnce(options);
  }
}

async function replayOnce<T>(
  options: AuthenticatedRequestOptions<T>,
): Promise<T> {
  try {
    return await executeAuthenticated(options);
  } catch (error) {
    reflectAuthenticatedError(error);
    if (isProblemStatus(error, 401)) {
      expireSession();
    }
    throw error;
  }
}

function executeAuthenticated<T>(
  options: AuthenticatedRequestOptions<T>,
): Promise<T> {
  return runWithAccessToken((token) =>
    apiRequest({ ...options, accessToken: token }),
  );
}

function shouldRefresh(error: unknown, path: string): boolean {
  return !path.startsWith('/auth/') && isProblemStatus(error, 401);
}

function isProblemStatus(error: unknown, status: number): boolean {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.status === status
  );
}
