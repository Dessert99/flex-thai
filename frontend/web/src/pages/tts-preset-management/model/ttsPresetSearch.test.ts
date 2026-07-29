/** TTS preset 검색값의 query 직렬화와 strict 정규화를 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  parseTtsPresetSearch,
  serializeTtsPresetSearch,
} from './ttsPresetSearch';

describe('TTS preset 검색 모델', () => {
  it('텍스트·enabled·pagination을 안정 순서로 직렬화한다', () => {
    const search = parseTtsPresetSearch({
      query: 'thai',
      enabled: 'false',
      page: '2',
    });
    expect(search).toEqual({
      query: 'thai',
      enabled: false,
      page: 2,
      pageSize: 20,
    });
    expect(serializeTtsPresetSearch(search)).toBe(
      'query=thai&enabled=false&page=2&pageSize=20',
    );
  });
});
