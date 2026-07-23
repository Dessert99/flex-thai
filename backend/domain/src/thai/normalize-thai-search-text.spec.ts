/** 원문 보존과 검색용 정규화를 분리하는 순수 함수 테스트 */
import { describe, expect, it } from 'vitest';
import { normalizeThaiSearchText } from './normalize-thai-search-text.js';

describe('normalizeThaiSearchText', () => {
  it('Unicode를 NFC로 맞추고 보이지 않는 문자와 중복 공백을 제거한다', () => {
    expect(normalizeThaiSearchText('  สวัสดี\u200B   ครับ  ')).toBe(
      'สวัสดี ครับ',
    );
  });
});
