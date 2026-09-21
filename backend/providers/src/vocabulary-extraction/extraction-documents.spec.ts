import { describe, expect, it, vi } from 'vitest';
import { DefaultExtractionDocuments } from './extraction-documents.js';
const source = {
  kind: 'image' as const,
  inputKey: 'image',
  sizeBytes: 12,
  uploadId: 'id',
};
const signal = new AbortController().signal;
describe('이미지 추출 자료', () => {
  it.each([
    { mimeType: 'image/png', bytes: [137, 80, 78, 71, 13, 10, 26, 10] },
    { mimeType: 'image/jpeg', bytes: [255, 216, 255, 224] },
    {
      mimeType: 'image/webp',
      bytes: [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80],
    },
  ])(
    '파일 내용으로 $mimeType 형식을 판별하고 한 묶음으로 처리한다',
    async ({ mimeType, bytes }) => {
      const image = new Uint8Array(bytes);
      const documents = new DefaultExtractionDocuments(
        vi.fn().mockResolvedValue(image),
      );
      expect(await documents.prepare(source, signal)).toEqual([{}]);
      expect(await documents.read(source, {}, signal)).toEqual({
        image,
        mimeType,
      });
    },
  );
  it('지원하지 않는 파일 내용과 용량 초과를 거부한다', async () => {
    const documents = new DefaultExtractionDocuments(
      vi.fn().mockResolvedValue(new Uint8Array([1, 2])),
    );
    await expect(documents.read(source, {}, signal)).rejects.toThrow(
      'SOURCE_IMAGE_INVALID',
    );
    await expect(
      documents.prepare({ ...source, sizeBytes: 6 * 1024 * 1024 }, signal),
    ).rejects.toThrow('SOURCE_IMAGE_TOO_LARGE');
  });
});
