/** 로그인 뒤 보존할 내부 redirect 경로의 allowlist와 search 검증을 확인한다 */
import { describe, expect, it } from 'vitest';
import { parseSafeRedirect } from './redirectSearch';

describe('안전한 로그인 redirect', () => {
  it.each([
    ['/learn', '/learn'],
    ['/wordbooks', '/wordbooks'],
    [
      '/wordbooks/00000000-0000-4000-8000-000000000101?page=2&pageSize=20',
      '/wordbooks/00000000-0000-4000-8000-000000000101?page=2&pageSize=20',
    ],
  ])('승인된 내부 경로 %s를 보존한다', (value, expected) => {
    expect(parseSafeRedirect(value)).toBe(expected);
  });

  it.each([
    'https://evil.example/learn',
    '//evil.example/learn',
    '/learn#section',
    '/unknown',
    '/learn?next=/admin',
    '/wordbooks?unexpected=1',
    '/wordbooks/abc',
    '/wordbooks/not-a-uuid',
  ])('위험하거나 계약 밖인 redirect %s를 거부한다', (value) => {
    expect(parseSafeRedirect(value)).toBeUndefined();
  });

  it('문자열이 아닌 redirect를 거부한다', () => {
    expect(parseSafeRedirect({ to: '/learn' })).toBeUndefined();
  });
});
