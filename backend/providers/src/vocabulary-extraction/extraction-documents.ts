import { PDFDocument } from 'pdf-lib';
import type {
  ExtractionDocuments,
  ExtractionSource,
  ExtractionChunk,
} from '@flex-thia/domain/vocabulary-extraction/extraction';
import { readPublicWeb } from './public-web.reader.js';
export class DefaultExtractionDocuments implements ExtractionDocuments {
  constructor(
    private readonly readPdf: (
      key: string,
      size: number,
      signal: AbortSignal,
    ) => Promise<Uint8Array>,
  ) {}
  async prepare(
    source: ExtractionSource,
    signal: AbortSignal,
  ): Promise<ExtractionChunk[]> {
    if (source.kind === 'pdf') {
      const pdf = await PDFDocument.load(
        await this.readPdf(source.inputKey, source.sizeBytes, signal),
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
  ) {
    if (chunk.text !== undefined) return { text: chunk.text };
    if (source.kind !== 'pdf' || chunk.page === undefined)
      throw new Error('SOURCE_INVALID');
    const original = await PDFDocument.load(
      await this.readPdf(source.inputKey, source.sizeBytes, signal),
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
