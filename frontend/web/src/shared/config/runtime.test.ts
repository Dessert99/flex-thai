/** 런타임 API base URL의 기본값과 fail-fast 검증을 확인한다 */
import { describe, expect, it } from 'vitest';
import { readRuntimeConfig } from './runtime';

describe('런타임 설정', () => {
  it('환경변수가 없으면 same-origin API prefix를 사용한다', () => {
    expect(readRuntimeConfig({})).toEqual({ apiBaseUrl: '/api/v1' });
  });

  it('명시적인 HTTPS API URL의 마지막 슬래시를 정규화한다', () => {
    expect(
      readRuntimeConfig({
        VITE_API_BASE_URL: 'https://api.flex-thia.dev/api/v1/',
      }),
    ).toEqual({ apiBaseUrl: 'https://api.flex-thia.dev/api/v1' });
  });

  it.each(['api/v1', '//other.example/api/v1', 'javascript:alert(1)'])(
    '유효하지 않은 API base URL %s를 거부한다',
    (apiBaseUrl) => {
      expect(() =>
        readRuntimeConfig({ VITE_API_BASE_URL: apiBaseUrl }),
      ).toThrow('VITE_API_BASE_URL');
    },
  );
});
