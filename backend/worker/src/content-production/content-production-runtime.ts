/** 콘텐츠 제작 AI pipeline을 실행 mode별 실제 DB·provider adapter로 조립한다 */

import { DrizzleAiVocabularyProductionRepository } from '@flex-thia/database/repositories/content-production/drizzle-ai-vocabulary-production.repository';
import { DrizzleContentProductionRepository } from '@flex-thia/database/repositories/content-production/drizzle-content-production.repository';

import { DrizzleVocabularyProductionLookup } from '@flex-thia/database/queries/drizzle-vocabulary-production.lookup';
import type {
  ContentProductionInputReader,
  ExtractedVocabularyCandidate,
} from '@flex-thia/domain/content-production/ai-vocabulary-production';

import { FakeContentInputReader } from '@flex-thia/providers/fakes/fake-content-input.provider';
import { FakeContentOcrProvider } from '@flex-thia/providers/fakes/fake-content-ocr.provider';

import { FakeVocabularyCrossValidationProvider } from '@flex-thia/providers/fakes/fake-vocabulary-cross-validation.provider';
import { FakeVocabularyExtractionProvider } from '@flex-thia/providers/fakes/fake-vocabulary-extraction.provider';

import { AiVocabularyProductionProcessor } from './ai-vocabulary-production.processor.js';
import { createContentProductionDispatcher } from './content-production-dispatcher.js';
import { UnavailableContentProductionProcessor } from './unavailable-content-production.processor.js';

/** worker가 외부 비용 호출 여부를 결정하는 실행 mode */
export type ContentProductionRuntimeMode = 'local' | 'test' | 'production';

/** local AI pipeline의 비용 없는 입력·후보 fixture */
export interface LocalContentProductionRuntimeConfig {
  inputReader?: ContentProductionInputReader;
  vocabularyFixtures?: Record<string, ExtractedVocabularyCandidate[]>;
}

/** 콘텐츠 제작 task와 mode별 processor identity를 함께 반환한다 */
export const createContentProductionRuntime = (input: {
  database: ConstructorParameters<typeof DrizzleContentProductionRepository>[0];
  mode: ContentProductionRuntimeMode;
  local?: LocalContentProductionRuntimeConfig;
}) => {
  const repository = new DrizzleContentProductionRepository(input.database);
  if (input.mode === 'production') {
    const processor = new UnavailableContentProductionProcessor();
    return {
      mode: input.mode,
      repository,
      processor,
      vocabularyProcessor: null,
      handler: createContentProductionDispatcher(repository, processor),
    };
  }

  const vocabularyProcessor = new AiVocabularyProductionProcessor(
    input.local?.inputReader ?? new FakeContentInputReader({}),
    new FakeContentOcrProvider(),
    new FakeVocabularyExtractionProvider(input.local?.vocabularyFixtures ?? {}),
    new FakeVocabularyCrossValidationProvider(),
    new DrizzleVocabularyProductionLookup(
      input.database as unknown as ConstructorParameters<
        typeof DrizzleVocabularyProductionLookup
      >[0],
    ),
    new DrizzleAiVocabularyProductionRepository(
      input.database as unknown as ConstructorParameters<
        typeof DrizzleAiVocabularyProductionRepository
      >[0],
    ),
  );
  const processor = vocabularyProcessor;

  return {
    mode: input.mode,
    repository,
    processor,
    vocabularyProcessor,
    handler: createContentProductionDispatcher(repository, processor),
  };
};
