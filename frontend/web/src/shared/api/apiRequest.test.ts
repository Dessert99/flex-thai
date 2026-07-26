/** API transport의 계약 검증·인증 옵션·취소 경계를 검증한다 */
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './ApiError';
import { apiRequest } from './apiRequest';

const valueSchema = z.object({ value: z.string() }).strict();
const problem = {
  type: 'https://flex-thia.dev/problems/validation-error',
  title: '입력값이 올바르지 않습니다',
  status: 400,
  code: 'VALIDATION_ERROR',
  requestId: 'request-123',
  fieldErrors: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('problem+json 응답을 problem ApiError로 변환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(problem), {
          status: 400,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
    );

    const request = apiRequest({
      path: '/questions',
      response: { kind: 'json', schema: valueSchema },
    });

    const error = await request.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      detail: { kind: 'problem', problem },
    });
  });

  it('계약과 다른 성공 JSON을 invalid-response로 변환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: 123 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const request = apiRequest({
      path: '/questions',
      response: { kind: 'json', schema: valueSchema },
    });

    await expect(request).rejects.toMatchObject({
      detail: { kind: 'invalid-response' },
    });
  });

  it('기본 제한 시간에 의한 중단을 timeout으로 변환한다', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', createAbortingFetch());

    const expectation = expect(
      apiRequest({
        path: '/questions',
        response: { kind: 'json', schema: valueSchema },
      }),
    ).rejects.toMatchObject({ detail: { kind: 'timeout' } });

    await vi.advanceTimersByTimeAsync(15_000);
    await expectation;
  });

  it('호출자 signal의 중단을 cancelled로 변환한다', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', createAbortingFetch());

    const expectation = expect(
      apiRequest({
        path: '/questions',
        response: { kind: 'json', schema: valueSchema },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ detail: { kind: 'cancelled' } });

    controller.abort();
    await expectation;
  });
});

describe('apiRequest 요청 옵션', () => {
  it('204 empty 응답을 undefined로 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(
      apiRequest({
        method: 'POST',
        path: '/auth/logout',
        response: { kind: 'empty' },
      }),
    ).resolves.toBeUndefined();
  });

  it('요청한 경우에만 Authorization과 credentials를 추가한다', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ value: 'ok' }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest({
      path: '/public',
      response: { kind: 'json', schema: valueSchema },
    });
    await apiRequest({
      accessToken: 'access-token',
      includeCredentials: true,
      path: '/me',
      response: { kind: 'json', schema: valueSchema },
    });

    const publicInit = fetchMock.mock.calls[0]?.[1];
    const authenticatedInit = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(publicInit?.headers).has('Authorization')).toBe(false);
    expect(publicInit?.credentials).toBeUndefined();
    expect(new Headers(authenticatedInit?.headers).get('Authorization')).toBe(
      'Bearer access-token',
    );
    expect(authenticatedInit?.credentials).toBe('include');
  });

  it('challenge·로그인 TOTP·refresh·logout POST에만 CSRF 헤더를 추가한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const protectedPaths = [
      '/auth/challenges',
      '/auth/challenges/challenge-id/code',
      '/auth/challenges/challenge-id/link',
      '/auth/challenges/challenge-id/resend',
      '/auth/mfa/totp/challenge',
      '/auth/refresh',
      '/auth/logout',
    ];

    for (const path of protectedPaths) {
      await apiRequest({
        method: 'POST',
        path,
        response: { kind: 'empty' },
      });
    }
    await apiRequest({
      method: 'POST',
      path: '/auth/mfa/totp/setup',
      response: { kind: 'empty' },
    });
    await apiRequest({
      method: 'GET',
      path: '/auth/challenges',
      response: { kind: 'empty' },
    });

    for (const call of fetchMock.mock.calls.slice(0, protectedPaths.length)) {
      expect(new Headers(call[1]?.headers).get('X-CSRF-Protection')).toBe('1');
    }
    for (const call of fetchMock.mock.calls.slice(protectedPaths.length)) {
      expect(new Headers(call[1]?.headers).has('X-CSRF-Protection')).toBe(
        false,
      );
    }
  });
});

function createAbortingFetch() {
  return vi.fn<typeof fetch>((_input, init) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  });
}
