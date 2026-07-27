/** local OCR이 bytes를 같은 text로 재현하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeContentOcrProvider } from './fake-content-ocr.provider.js';

describe('FakeContentOcrProvider', () => {
  it('PDF·IMAGE fixture bytes를 UTF-8 text로 반환한다', async () => {
    const provider = new FakeContentOcrProvider();

    await expect(
      provider.recognize({
        bytes: new TextEncoder().encode('ข้อความ'),
        inputType: 'PDF',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ text: 'ข้อความ' });
  });
});
