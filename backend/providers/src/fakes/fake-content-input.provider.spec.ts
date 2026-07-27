/** local 입력 reader가 key별 bytes와 누락 오류를 결정적으로 반환하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeContentInputReader } from './fake-content-input.provider.js';

describe('FakeContentInputReader', () => {
  it('등록한 inputKey의 bytes를 반환한다', async () => {
    const reader = new FakeContentInputReader({
      'private/input.txt': 'สวัสดี',
    });

    const bytes = await reader.read(
      {
        jobInputId: 'input-id',
        ordinal: 0,
        uploadId: 'upload-id',
        inputType: 'TEXT',
        inputKey: 'private/input.txt',
        sizeBytes: 7,
      },
      new AbortController().signal,
    );

    expect(new TextDecoder().decode(bytes)).toBe('สวัสดี');
  });
});
