/** TTS 작업 항목 URL 검색값을 strict query 계약으로 검증한다 */
import { describe, expect, it } from 'vitest';
import { parseTtsJobItemsSearch } from './ttsJobItemsSearch';

describe('TTS 작업 항목 검색 모델', () => {
  it('상태·오류·pagination을 정규화하고 unknown key를 거부한다', () => {
    expect(
      parseTtsJobItemsSearch({
        status: 'FAILED',
        errorCode: 'TTS_PROVIDER_TIMEOUT',
        page: '2',
      }),
    ).toEqual({
      status: 'FAILED',
      errorCode: 'TTS_PROVIDER_TIMEOUT',
      page: 2,
      pageSize: 20,
    });
    expect(() => parseTtsJobItemsSearch({ unknown: true })).toThrow();
  });
});
