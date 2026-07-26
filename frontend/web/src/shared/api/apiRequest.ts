/** native fetch 응답을 공개 Zod 계약과 ApiError로 제한한다 */
import { problemDetailsSchema } from '@flex-thia/contracts';
import type { z } from 'zod';
import { runtimeConfig } from '../config';
import { ApiError } from './ApiError';

/** JSON 검증 또는 body 없는 성공을 표현하는 응답 계약 */
export type ResponseContract<T> =
  { kind: 'json'; schema: z.ZodType<T> } | { kind: 'empty' };

/** API transport가 지원하는 HTTP method */
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** 검증된 API 요청에 필요한 transport 옵션 */
export interface ApiRequestOptions<T> {
  accessToken?: string;
  body?: unknown;
  headers?: HeadersInit;
  includeCredentials?: boolean;
  method?: ApiMethod;
  path: string;
  response: ResponseContract<T>;
  signal?: AbortSignal;
  timeoutMs?: 15_000 | 60_000;
}

const csrfProtectedPaths = new Set([
  '/auth/mfa/totp/challenge',
  '/auth/refresh',
  '/auth/logout',
]);

const isCsrfProtectedPath = (path: string): boolean =>
  csrfProtectedPaths.has(path) ||
  path === '/auth/challenges' ||
  path.startsWith('/auth/challenges/');

function createHeaders<T>(options: ApiRequestOptions<T>) {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.delete('Authorization');
  headers.delete('X-CSRF-Protection');

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.accessToken !== undefined) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }
  if (
    options.method === 'POST' &&
    isCsrfProtectedPath(options.path.split('?')[0] ?? '')
  ) {
    headers.set('X-CSRF-Protection', '1');
  }

  return headers;
}

function createRequestInit<T>(
  options: ApiRequestOptions<T>,
  signal: AbortSignal,
): RequestInit {
  return {
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    ...(options.includeCredentials ? { credentials: 'include' as const } : {}),
    headers: createHeaders(options),
    method: options.method ?? 'GET',
    signal,
  };
}

function createRequestUrl(path: string) {
  return `${runtimeConfig.apiBaseUrl.replace(/\/$/u, '')}/${path.replace(
    /^\//u,
    '',
  )}`;
}

async function toResponseError(response: Response) {
  if (
    response.headers
      .get('Content-Type')
      ?.toLowerCase()
      .includes('application/problem+json')
  ) {
    try {
      const parsed = problemDetailsSchema.safeParse(await response.json());
      if (parsed.success) {
        return new ApiError({ kind: 'problem', problem: parsed.data });
      }
    } catch {
      return new ApiError({ kind: 'invalid-response' });
    }
  }

  return new ApiError({ kind: 'invalid-response' });
}

async function parseSuccess<T>(
  response: Response,
  contract: ResponseContract<T>,
): Promise<T> {
  if (contract.kind === 'empty') {
    return undefined as T;
  }

  try {
    const parsed = contract.schema.safeParse(await response.json());
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    throw new ApiError({ kind: 'invalid-response' });
  }

  throw new ApiError({ kind: 'invalid-response' });
}

/** 요청을 실행하고 검증된 성공값 또는 정규화 ApiError만 반환한다 */
export async function apiRequest<T>(options: ApiRequestOptions<T>): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => timeoutController.abort(),
    options.timeoutMs ?? 15_000,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    let response: Response;
    try {
      response = await fetch(
        createRequestUrl(options.path),
        createRequestInit(options, signal),
      );
    } catch {
      if (options.signal?.aborted) {
        throw new ApiError({ kind: 'cancelled' });
      }
      if (timeoutController.signal.aborted) {
        throw new ApiError({ kind: 'timeout' });
      }
      throw new ApiError({ kind: 'network' });
    }

    if (!response.ok) {
      throw await toResponseError(response);
    }

    return await parseSuccess(response, options.response);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
