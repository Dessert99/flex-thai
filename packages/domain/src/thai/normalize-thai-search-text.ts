/** 태국어 원문을 훼손하지 않고 검색·중복 판정용 문자열만 만든다 */
const INVISIBLE_CHARACTERS = /[\u200B-\u200D\uFEFF]/gu;
const REPEATED_WHITESPACE = /\s+/gu;

/** 검색과 초기 중복 판정에 쓰는 버전 1 정규화 */
export const normalizeThaiSearchText = (value: string): string =>
  value
    .normalize('NFC')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(REPEATED_WHITESPACE, ' ')
    .trim();
