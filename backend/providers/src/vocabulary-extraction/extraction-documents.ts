import { PDFDocument } from 'pdf-lib';
import type {
  ExtractionDocuments,
  ExtractionSource,
  ExtractionChunk,
  ExtractionDocument,
} from '@flex-thia/domain/vocabulary-extraction/extraction';
import { readPublicWeb } from './public-web.reader.js';
export class DefaultExtractionDocuments implements ExtractionDocuments {
  constructor(
    private readonly readFile: (
      key: string,
      size: number,
      signal: AbortSignal,
    ) => Promise<Uint8Array>,
  ) {}
  async prepare(
    source: ExtractionSource,
    signal: AbortSignal,
  ): Promise<ExtractionChunk[]> {
    if (source.kind === 'image') {
      if (source.sizeBytes > 5 * 1024 * 1024)
        throw new Error('SOURCE_IMAGE_TOO_LARGE');
      return [{}];
    }
    if (source.kind === 'pdf') {
      const pdf = await PDFDocument.load(
        await this.readFile(source.inputKey, source.sizeBytes, signal),
      );
      if (pdf.getPageCount() > 100) throw new Error('SOURCE_TOO_MANY_PAGES');
      return pdf.getPageIndices().map((page) => ({ page }));
    }
    const text = await readPublicWeb(source.url, signal);
    if (!text.trim()) throw new Error('SOURCE_EMPTY');
    if (text.length > 200000) throw new Error('SOURCE_TOO_LARGE');
    const chunks: ExtractionChunk[] = [];
    for (let start = 0; start < text.length; start += 7500)
      chunks.push({ text: text.slice(start, start + 8000) });
    return chunks;
  }
  async read(
    source: ExtractionSource,
    chunk: ExtractionChunk,
    signal: AbortSignal,
  ): Promise<ExtractionDocument> {
    if (source.kind === 'image') {
      const image = await this.readFile(
        source.inputKey,
        source.sizeBytes,
        signal,
      );
      if (image.length > 5 * 1024 * 1024)
        throw new Error('SOURCE_IMAGE_TOO_LARGE');
      return { image, mimeType: imageMimeType(image) };
    }
    if (chunk.text !== undefined) return { text: chunk.text };
    if (source.kind !== 'pdf' || chunk.page === undefined)
      throw new Error('SOURCE_INVALID');
    const original = await PDFDocument.load(
      await this.readFile(source.inputKey, source.sizeBytes, signal),
    );
    const document = await PDFDocument.create();
    const [page] = await document.copyPages(original, [chunk.page]);
    if (!page) throw new Error('SOURCE_INVALID');
    document.addPage(page);
    const pdf = await document.save();
    if (pdf.length > 15000000) throw new Error('SOURCE_PAGE_TOO_LARGE');
    return { pdf };
  }
}

function imageMimeType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' {
  const data = Buffer.from(bytes);
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return 'image/jpeg';
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  throw new Error('SOURCE_IMAGE_INVALID');
}
