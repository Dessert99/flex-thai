/** TTS 작업 URL 검색값의 strict 정규화와 page reset을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  parseTtsOperationsSearch,
  updateTtsOperationsSearch,
} from './ttsOperationsSearch';

describe('TTS 작업 검색 모델', () => {
  it('기본 pagination과 기간·상태를 정규화한다', () => {
    expect(
      parseTtsOperationsSearch({
        status: 'FAILED',
        from: '2026-07-01T00:00:00.000Z',
        page: '2',
      }),
    ).toEqual({
      status: 'FAILED',
      from: '2026-07-01T00:00:00.000Z',
      page: 2,
      pageSize: 20,
    });
    expect(() => parseTtsOperationsSearch({ unknown: true })).toThrow();
  });

  it('filter 변경은 page를 1로 되돌리고 undefined를 제거한다', () => {
    expect(
      updateTtsOperationsSearch(
        { status: 'FAILED', page: 3, pageSize: 20 },
        { status: undefined },
      ),
    ).toEqual({ page: 1, pageSize: 20 });
  });
});
