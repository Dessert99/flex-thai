import type {
  ExtractionAi,
  ExtractionDocuments,
  ExtractionJob,
  ExtractionRepository,
  ExtractionResult,
  ExtractionWord,
} from './extraction.js';
import type { VocabularyProductionLookup } from '../vocabulary/vocabulary-production-lookup.js';
import { normalizeThaiSearchText } from '../vocabulary/normalize-thai-search-text.js';

/** 자료 묶음별 checkpoint를 기준으로 재시작하며 완성되지 않은 응답은 저장하지 않는다. */
export class ExtractionRunner {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly documents: ExtractionDocuments,
    private readonly ai: ExtractionAi,
    private readonly vocabulary: Pick<VocabularyProductionLookup, 'findExact'>,
  ) {}
  async runOnce(shutdown: AbortSignal) {
    const job = await this.repository.claim();
    if (!job?.leaseToken) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([shutdown, controller.signal]);
    const token = job.leaseToken;
    let renewing = false;
    const timer = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void this.repository
        .heartbeat(job.id, token)
        .then((ok) => {
          if (!ok) controller.abort();
        })
        .catch(() => controller.abort())
        .finally(() => {
          renewing = false;
        });
    }, 20000);
    try {
      await this.process(job, signal);
    } catch (error) {
      if (!signal.aborted)
        await this.repository.finish(job, safeExtractionError(error));
    } finally {
      clearInterval(timer);
    }
  }
  private async process(job: ExtractionJob, signal: AbortSignal) {
    let chunks = await this.repository.chunks(job.id);
    if (chunks.length === 0) {
      chunks = await this.documents.prepare(
        job.source,
        AbortSignal.any([signal, AbortSignal.timeout(60000)]),
      );
      if (!chunks.length) throw new Error('SOURCE_EMPTY');
      await this.repository.prepare(job, chunks);
    }
    job.total = chunks.length;
    for (const [ordinal, chunk] of chunks.entries()) {
      signal.throwIfAborted();
      if (chunk.words !== undefined) continue;
      const document = await this.documents.read(job.source, chunk, signal);
      const words = await retryTransient(
        () =>
          this.ai.extract({
            prompt: job.prompt,
            document,
            config: job.config,
            signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
          }),
        signal,
      );
      chunk.words = words;
      await this.repository.checkpoint(job, ordinal, chunk, 1);
    }
    await this.repository.advance(job, 2);
    const accepted: ExtractionResult[] = chunks.flatMap(
      (chunk) => chunk.results ?? [],
    );
    for (const [ordinal, chunk] of chunks.entries()) {
      signal.throwIfAborted();
      if (chunk.results !== undefined) continue;
      const results: ExtractionResult[] = [];
      let excluded = 0;
      for (const word of chunk.words ?? []) {
        signal.throwIfAborted();
        const result = await this.classify(word, accepted, job, signal);
        if (result) {
          results.push(result);
          accepted.push(result);
        } else excluded++;
      }
      chunk.results = results;
      chunk.excluded = excluded;
      await this.repository.checkpoint(job, ordinal, chunk, 2);
    }
    signal.throwIfAborted();
    await this.repository.advance(job, 3);
    await this.repository.finish(job);
  }
  private async classify(
    word: ExtractionWord,
    accepted: ExtractionResult[],
    job: ExtractionJob,
    signal: AbortSignal,
  ): Promise<ExtractionResult | null> {
    const normalized = normalizeThaiSearchText(word.thai);
    const existing = await this.vocabulary.findExact(normalized);
    const meanings = [
      ...(existing?.meanings.map((item) => item.meaningKo) ?? []),
      ...accepted
        .filter((item) => normalizeThaiSearchText(item.thai) === normalized)
        .map((item) => item.meaningKo),
    ];
    if (
      meanings.some(
        (meaning) =>
          meaning.normalize('NFC').trim() ===
          word.meaningKo.normalize('NFC').trim(),
      )
    )
      return null;
    if (
      meanings.length &&
      (await retryTransient(
        () =>
          this.ai.sameMeaning({
            word,
            meanings,
            config: job.config,
            signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
          }),
        signal,
      ))
    )
      return null;
    return {
      ...word,
      thai: normalized,
      classification: existing ? 'NEW_MEANING' : 'NEW_WORD',
      vocabularyId: existing?.vocabularyId ?? null,
    };
  }
}
export function safeExtractionError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (/^(SOURCE_[A-Z_]+|AI_[A-Z_]+|WORKER_INTERRUPTED)$/u.test(code))
    return code;
  if (
    error instanceof Error &&
    ['TimeoutError', 'AbortError'].includes(error.name)
  )
    return 'AI_TIMEOUT';
  return 'EXTRACTION_FAILED';
}
async function retryTransient<T>(
  call: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const code = safeExtractionError(error);
      if (attempt >= 2 || !['AI_RATE_LIMIT', 'AI_UNAVAILABLE'].includes(code))
        throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new Error('EXTRACTION_ABORTED'));
        };
        const timer = setTimeout(
          () => {
            signal.removeEventListener('abort', abort);
            resolve();
          },
          1000 * 2 ** attempt,
        );
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
}
