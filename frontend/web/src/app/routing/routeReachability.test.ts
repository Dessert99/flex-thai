/** 승인된 정적·동적 navigation target이 생성 route tree에 남아 있는지 검증한다 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from '../router';

const router = createAppRouter(new QueryClient());
const approvedTargets = [
  '/',
  '/login',
  '/login/challenge',
  '/login/confirm',
  '/login/mfa',
  '/learn',
  '/vocabularies',
  '/wordbooks',
  '/admin',
  '/admin/users',
  '/admin/audit-logs',
  '/admin/totp-setup',
  '/admin/vocabularies',
  '/admin/content-error-reports',
  '/admin/usage-cost',
  '/forbidden',
] as const;
const vocabularyId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';
const wordbookId = '01933b6a-8f13-7a19-b7e5-536d70f57aae';
const dynamicTargets = [
  {
    build: () =>
      router.buildLocation({
        params: { wordbookId },
        search: { page: 1, pageSize: 20 },
        to: '/wordbooks/$wordbookId',
      }),
    label: '학습자 단어장 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { vocabularyId },
        search: { page: 1, pageSize: 20 },
        to: '/vocabularies/$vocabularyId',
      }),
    label: '학습자 어휘 상세',
  },
  {
    build: () =>
      router.buildLocation({
        params: { vocabularyId },
        search: { page: 1, pageSize: 20 },
        to: '/admin/vocabularies/$vocabularyId',
      }),
    label: '관리자 어휘 상세',
  },
] as const;

describe('route 도달 가능성', () => {
  it.each(approvedTargets)('%s 경로를 route tree에서 찾을 수 있다', (to) => {
    expect(
      (router.routesByPath as unknown as Record<string, unknown>)[to],
    ).toBeDefined();
    expect(() => router.buildLocation({ to })).not.toThrow();
  });

  it.each(dynamicTargets)(
    '$label 경로와 대표 UUID params를 조립할 수 있다',
    ({ build }) => {
      expect(build).not.toThrow();
    },
  );

  it.each([
    '/wordbooks/$wordbookId',
    '/vocabularies/$vocabularyId',
    '/admin/vocabularies/$vocabularyId',
  ])('%s 동적 경로를 route tree에서 찾을 수 있다', (to) => {
    expect(
      (router.routesByPath as unknown as Record<string, unknown>)[to],
    ).toBeDefined();
  });

  it.each(['/admin/usage-cost'])(
    '%s 경로가 route loader로 화면 query를 미리 불러온다',
    (to) => {
      const route = (
        router.routesByPath as unknown as Record<
          string,
          { options?: { loader?: unknown } }
        >
      )[to];
      expect(route?.options?.loader).toBeTypeOf('function');
    },
  );
});
