import { describe, expect, it, vi } from 'vitest';
import { ExtractionRunner } from './extraction-runner.js';
import type {
  ExtractionRepository,
  ExtractionChunk,
  ExtractionJob,
  ExtractionAi,
} from './extraction.js';
const word = {
  thai: 'กิน',
  meaningKo: '먹다',
  partOfSpeech: '동사',
  context: 'กินข้าว',
};
function setup(
  initial: ExtractionChunk[] = [{ text: 'one' }, { text: 'two' }],
) {
  const job: ExtractionJob = {
    id: 'job',
    ownerId: 'owner',
    requestId: 'request',
    requestHash: 'hash',
    sourceName: '자료',
    source: { kind: 'url', url: 'https://example.com' },
    prompt: 'extract',
    config: { provider: 'gemini', model: 'test', promptVersion: '1' },
    status: 'running',
    stage: 1,
    total: 2,
    completed: 0,
    compared: 0,
    error: null,
    leaseToken: 'token',
    leaseUntil: new Date(Date.now() + 90000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let stored = structuredClone(initial);
  const repository = {
    review: vi.fn(),
    save: vi.fn(),
    latestSaved: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    retry: vi.fn(),
    claim: vi.fn<ExtractionRepository['claim']>().mockResolvedValue(job),
    heartbeat: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    chunks: vi.fn(() => Promise.resolve(structuredClone(stored))),
    prepare: vi.fn<ExtractionRepository['prepare']>((_job, chunks) => {
      stored = structuredClone(chunks);
      return Promise.resolve();
    }),
    checkpoint: vi.fn<ExtractionRepository['checkpoint']>(
      (_job, index, chunk) => {
        stored[index] = structuredClone(chunk);
        return Promise.resolve();
      },
    ),
    advance: vi.fn<ExtractionRepository['advance']>((_job, stage) => {
      job.stage = stage;
      return Promise.resolve();
    }),
    finish: vi.fn<ExtractionRepository['finish']>(),
  } satisfies ExtractionRepository;
  const ai = {
    extract: vi.fn<ExtractionAi['extract']>().mockResolvedValue([word]),
    sameMeaning: vi.fn<ExtractionAi['sameMeaning']>().mockResolvedValue(true),
  } satisfies ExtractionAi;
  const documents = {
    prepare: vi.fn().mockResolvedValue([{ text: 'source' }]),
    read: vi.fn().mockResolvedValue({ text: 'source' }),
  };
  const vocabulary = {
    findExact: vi.fn(() =>
      Promise.resolve(
        null as {
          vocabularyId: string;
          meanings: { meaningKo: string }[];
        } | null,
      ),
    ),
  };
  const runner = new ExtractionRunner(repository, documents, ai, vocabulary);
  return {
    runner,
    repository,
    ai,
    documents,
    vocabulary,
    stored: () => stored,
  };
}
describe('durable extraction', () => {
  it('retries only the incomplete chunk after extraction failure', async () => {
    const f = setup();
    vi.mocked(f.ai.extract)
      .mockResolvedValueOnce([word])
      .mockRejectedValueOnce(new Error('AI_TIMEOUT'));
    await f.runner.runOnce(new AbortController().signal);
    expect(f.stored()[0]?.words).toEqual([word]);
    expect(f.stored()[1]?.words).toBeUndefined();
    expect(f.repository.finish).toHaveBeenLastCalledWith(
      expect.anything(),
      'AI_TIMEOUT',
    );
    await f.runner.runOnce(new AbortController().signal);
    expect(f.ai.extract).toHaveBeenCalledTimes(3);
    expect(f.stored().flatMap((c) => c.results ?? [])).toHaveLength(1);
    expect(f.stored()[1]?.excluded).toBe(1);
  });
  it('reuses extracted words after semantic comparison failure', async () => {
    const f = setup([{ text: 'source', words: [word] }]);
    f.vocabulary.findExact.mockResolvedValue({
      vocabularyId: 'existing',
      meanings: [{ meaningKo: '음식을 섭취하다' }],
    });
    vi.mocked(f.ai.sameMeaning)
      .mockRejectedValueOnce(new Error('AI_TIMEOUT'))
      .mockResolvedValueOnce(true);
    await f.runner.runOnce(new AbortController().signal);
    await f.runner.runOnce(new AbortController().signal);
    expect(f.ai.extract).not.toHaveBeenCalled();
    expect(f.stored()[0]?.results).toEqual([]);
    expect(f.stored()[0]?.excluded).toBe(1);
  });
  it('distinguishes new words and new meanings without review', async () => {
    const f = setup([
      {
        text: 'source',
        words: [word, { ...word, thai: 'บ้าน', meaningKo: '집' }],
      },
    ]);
    f.vocabulary.findExact
      .mockResolvedValueOnce({
        vocabularyId: 'existing',
        meanings: [{ meaningKo: '소모하다' }],
      })
      .mockResolvedValueOnce(null);
    vi.mocked(f.ai.sameMeaning).mockResolvedValue(false);
    await f.runner.runOnce(new AbortController().signal);
    expect(f.stored()[0]?.results?.map((r) => r.classification)).toEqual([
      'NEW_MEANING',
      'NEW_WORD',
    ]);
    expect(f.repository.finish).toHaveBeenLastCalledWith(expect.anything());
  });
  it('does not finish a worker that loses its lease', async () => {
    const f = setup();
    vi.mocked(f.repository.checkpoint).mockRejectedValue(
      new Error('EXTRACTION_LEASE_LOST'),
    );
    vi.mocked(f.repository.finish).mockRejectedValue(
      new Error('EXTRACTION_LEASE_LOST'),
    );
    await expect(
      f.runner.runOnce(new AbortController().signal),
    ).rejects.toThrow('EXTRACTION_LEASE_LOST');
  });
});
