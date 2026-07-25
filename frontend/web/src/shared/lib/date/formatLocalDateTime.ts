/** 원본 ISO 값을 보존한 채 브라우저 현지 시간으로 표시한다 */

const koreanDateTime = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** ISO datetime을 브라우저 현지 시간대의 한국어 문자열로 변환한다 */
export function formatLocalDateTime(isoDateTime: string): string {
  return koreanDateTime.format(new Date(isoDateTime));
}
