import { S3Client } from '@aws-sdk/client-s3';
import { DrizzleExtractionRepository } from '@flex-thia/database/repositories/content-production/drizzle-extraction.repository';
import { DrizzleVocabularyProductionLookup } from '@flex-thia/database/queries/drizzle-vocabulary-production.lookup';
import { ExtractionRunner } from '@flex-thia/domain/vocabulary-extraction/extraction-runner';
import { DefaultExtractionDocuments } from '@flex-thia/providers/vocabulary-extraction/extraction-documents';
import { MultimodalExtractionAi } from '@flex-thia/providers/vocabulary-extraction/multimodal-extraction.ai';
import {
  LocalFileUploadProvider,
  resolveLocalUploadDirectory,
} from '@flex-thia/providers/storage/local-file-upload.provider';
import { S3ContentProductionInputReader } from '@flex-thia/providers/storage/s3-content-production-input.reader';
import { createWorkerDatabase } from '../database-runtime.js';

export function createExtractionRunner() {
  const database = createWorkerDatabase();
  const local = process.env.DATABASE_MODE === 'local';
  const localStorage = local
    ? new LocalFileUploadProvider(
        resolveLocalUploadDirectory(process.env),
        process.env.FLEX_THIA_LOCAL_PUBLIC_ORIGIN ?? 'http://localhost:5173',
        process.env.FLEX_THIA_LOCAL_UPLOAD_HMAC_SECRET ??
          'local-only-content-upload-hmac-secret',
      )
    : null;
  const s3 = new S3ContentProductionInputReader(
    new S3Client({ region: process.env.AWS_REGION ?? 'ap-northeast-2' }),
    process.env.INPUT_BUCKET_NAME ?? '',
  );
  const documents = new DefaultExtractionDocuments(
    (inputKey, sizeBytes, signal) =>
      localStorage
        ? localStorage.readInput(inputKey, sizeBytes)
        : s3.read({ inputKey, sizeBytes }, signal),
  );
  return new ExtractionRunner(
    new DrizzleExtractionRepository(database),
    documents,
    new MultimodalExtractionAi(),
    new DrizzleVocabularyProductionLookup(
      database as unknown as ConstructorParameters<
        typeof DrizzleVocabularyProductionLookup
      >[0],
    ),
  );
}
/** API 프로세스와 독립적으로 실행되는 durable DB queue 소비자 */
export async function runExtractionLoop(signal: AbortSignal) {
  const runner = createExtractionRunner();
  while (!signal.aborted) {
    try {
      await runner.runOnce(signal);
    } catch {
      console.error('Vocabulary extraction worker cycle failed');
    }
    if (!signal.aborted)
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }
}
