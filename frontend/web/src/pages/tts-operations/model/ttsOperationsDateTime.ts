/** TTS 작업 UTC ISO와 브라우저 datetime-local 값을 같은 순간으로 변환한다 */

const pad = (value: number): string => String(value).padStart(2, '0');
const padMilliseconds = (value: number): string =>
  String(value).padStart(3, '0');

/** UTC ISO를 브라우저 timezone의 분 단위 datetime-local 값으로 바꾼다 */
export function toTtsOperationsDateTimeLocal(
  value: string | undefined,
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const milliseconds = date.getMilliseconds();
  if (milliseconds !== 0) {
    return `${minutes}:${pad(date.getSeconds())}.${padMilliseconds(milliseconds)}`;
  }
  return date.getSeconds() === 0
    ? minutes
    : `${minutes}:${pad(date.getSeconds())}`;
}

/** 브라우저 timezone의 datetime-local 값을 UTC ISO로 바꾼다 */
export function fromTtsOperationsDateTimeLocal(
  value: string,
): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
