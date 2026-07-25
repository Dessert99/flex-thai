/** 브라우저 Web Crypto로 파일 내용의 SHA-256 hex를 계산한다 */

/** 같은 byte 입력을 서버 계약이 요구하는 소문자 64자리 hex로 반환한다 */
export async function computeSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
