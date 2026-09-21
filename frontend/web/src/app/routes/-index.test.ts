/** 공개 홈에 인증 redirect와 개인 데이터 loader가 없는지 검증한다. */
import { describe, expect, it } from 'vitest';
import { LandingPage } from '@/pages/home/LandingPage';
import { Route } from './index';

describe('공개 홈 route', () => {
  it('세션 redirect 없이 랜딩 페이지를 연결한다', () => {
    expect(Route.options.component).toBe(LandingPage);
    expect(Route.options.beforeLoad).toBeUndefined();
    expect(Route.options.loader).toBeUndefined();
  });
});
