/** 재시작 가능한 추출 작업의 저장 모델과 외부 처리 경계 */
export type ExtractionWord = {
  thai: string;
  meaningKo: string;
  partOfSpeech: string;
  context: string;
};
export type ExtractionResult = ExtractionWord & {
  classification: 'NEW_WORD' | 'NEW_MEANING';
  vocabularyId: string | null;
};
export type ExtractionSource =
  | { kind: 'url'; url: string }
  | { kind: 'pdf'; inputKey: string; sizeBytes: number; uploadId: string }
  | { kind: 'image'; inputKey: string; sizeBytes: number; uploadId: string };
export type ExtractionChunk = {
  page?: number;
  text?: string;
  words?: ExtractionWord[];
  results?: ExtractionResult[];
  excluded?: number;
};
export type ExtractionConfig = {
  provider: 'gemini' | 'claude';
  model: string;
  promptVersion: '1';
};
export type ExtractionJob = {
  id: string;
  ownerId: string;
  requestId: string;
  requestHash: string;
  sourceName: string;
  source: ExtractionSource;
  prompt: string;
  config: ExtractionConfig;
  status: 'queued' | 'running' | 'failed' | 'stopped' | 'complete';
  stage: number;
  total: number;
  completed: number;
  compared: number;
  error: string | null;
  leaseToken: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export interface ExtractionRepository {
  review(id: string): Promise<{
    items: ExtractionReviewItem[];
    excluded: number;
    receipt: ExtractionSaveReceipt | null;
  }>;
  save(
    id: string,
    ownerId: string,
    selectedIds: string[],
  ): Promise<ExtractionSaveReceipt>;
  latestSaved(): Promise<{
    jobId: string;
    sourceName: string;
    receipt: ExtractionSaveReceipt;
  } | null>;
  create(
    input: Pick<
      ExtractionJob,
      | 'ownerId'
      | 'requestId'
      | 'requestHash'
      | 'sourceName'
      | 'source'
      | 'prompt'
      | 'config'
    >,
  ): Promise<ExtractionJob>;
  get(id: string, ownerId: string): Promise<ExtractionJob | null>;
  list(ownerId: string): Promise<ExtractionJob[]>;
  retry(id: string, ownerId: string): Promise<boolean>;
  claim(): Promise<ExtractionJob | null>;
  heartbeat(id: string, token: string): Promise<boolean>;
  chunks(id: string): Promise<ExtractionChunk[]>;
  prepare(job: ExtractionJob, chunks: ExtractionChunk[]): Promise<void>;
  checkpoint(
    job: ExtractionJob,
    ordinal: number,
    chunk: ExtractionChunk,
    stage: number,
  ): Promise<void>;
  advance(job: ExtractionJob, stage: number): Promise<void>;
  finish(job: ExtractionJob, error?: string): Promise<void>;
}
export type ExtractionDocument =
  | { text: string }
  | { pdf: Uint8Array }
  | { image: Uint8Array; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };

export interface ExtractionAi {
  extract(input: {
    prompt: string;
    document: ExtractionDocument;
    config: ExtractionConfig;
    signal: AbortSignal;
  }): Promise<ExtractionWord[]>;
  sameMeaning(input: {
    word: ExtractionWord;
    meanings: string[];
    config: ExtractionConfig;
    signal: AbortSignal;
  }): Promise<boolean>;
}
export interface ExtractionDocuments {
  prepare(
    source: ExtractionSource,
    signal: AbortSignal,
  ): Promise<ExtractionChunk[]>;
  read(
    source: ExtractionSource,
    chunk: ExtractionChunk,
    signal: AbortSignal,
  ): Promise<ExtractionDocument>;
}

/** 저장된 청크 위치로 식별하며 클라이언트가 단어 내용을 변경하지 않는다. */
export type ExtractionReviewItem = ExtractionResult & {
  id: string;
  page: number | null;
  existingMeanings: string[];
};
export type ExtractionSaveReceipt = {
  savedAt: string;
  selectedIds: string[];
  items: Array<{
    vocabularyId: string;
    meaningId: string;
    thai: string;
    meaningKo: string;
    classification: 'NEW_WORD' | 'NEW_MEANING';
  }>;
};
export function extractionReviewItems(
  chunks: ExtractionChunk[],
): ExtractionReviewItem[] {
  return chunks.flatMap((chunk, ordinal) =>
    (chunk.results ?? []).map((item, index) => ({
      ...item,
      id: `${ordinal}:${index}`,
      page: chunk.page ?? null,
      existingMeanings: [],
    })),
  );
}
