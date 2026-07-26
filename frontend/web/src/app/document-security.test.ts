/** 초기 SPA resource 요청 전 referrer policy가 적용되는지 검증한다 */
import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';

describe('정적 문서 보안 정책', () => {
  it('module script 실행 전 document head에 no-referrer를 선언한다', () => {
    const document = new DOMParser().parseFromString(html, 'text/html');

    expect(
      document.head
        .querySelector('meta[name="referrer"]')
        ?.getAttribute('content'),
    ).toBe('no-referrer');
    expect(document.body.querySelector('script[type="module"]')).not.toBeNull();
  });
});
