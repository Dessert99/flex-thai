/** Web Crypto 기반 파일 SHA-256의 결정적 hex 출력을 검증한다 */
import { describe, expect, it } from 'vitest';
import { computeSha256 } from './computeSha256';

describe('음성 파일 SHA-256 계산', () => {
  it('같은 byte를 표준 소문자 hex digest로 반환한다', async () => {
    const file = createFile('hello');

    await expect(computeSha256(file)).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    await expect(computeSha256(file)).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

function createFile(content: string) {
  const bytes = new TextEncoder().encode(content);
  const file = new File([bytes], 'greeting.mp3', { type: 'audio/mpeg' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () =>
      Promise.resolve(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      ),
  });
  return file;
}
