/** 콘텐츠 제작 AI pipeline을 실행 mode별 실제 DB·provider adapter로 조립한다 */
import {
  DrizzleAiQuestionProductionRepository,
  DrizzleAiVocabularyProductionRepository,
  DrizzleContentProductionRepository,
  DrizzlePublishedQuestionSimilarityLookup,
  DrizzleQuestionProductionContextQuery,
  DrizzleVocabularyProductionLookup,
} from '@flex-thia/database';
import type {
  ContentProductionInputReader,
  ExtractedVocabularyCandidate,
  GeneratedQuestionCandidate,
} from '@flex-thia/domain';
import {
  FakeContentInputReader,
  FakeContentOcrProvider,
  FakeQuestionCrossValidationProvider,
  FakeQuestionGenerationProvider,
  FakeVocabularyCrossValidationProvider,
  FakeVocabularyExtractionProvider,
} from '@flex-thia/providers';
import { AiQuestionProductionProcessor } from './ai-question-production.processor.js';
import { AiVocabularyProductionProcessor } from './ai-vocabulary-production.processor.js';
import {
  createContentProductionDispatcher,
  createContentProductionProcessorRouter,
  type ContentProductionItemProcessor,
} from './content-production-dispatcher.js';
import { UnavailableContentProductionProcessor } from './unavailable-content-production.processor.js';

/** worker가 외부 비용 호출 여부를 결정하는 실행 mode */
export type ContentProductionRuntimeMode = 'local' | 'test' | 'production';

/** local AI pipeline의 비용 없는 입력·후보 fixture */
export interface LocalContentProductionRuntimeConfig {
  inputReader?: ContentProductionInputReader;
  vocabularyFixtures?: Record<string, ExtractedVocabularyCandidate[]>;
  questionFixtures?: Record<string, GeneratedQuestionCandidate[]>;
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
      questionProcessor: null,
      similarityLookup: null,
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
  const questionRepository = new DrizzleAiQuestionProductionRepository(
    input.database,
  );
  const similarityLookup = new DrizzlePublishedQuestionSimilarityLookup(
    input.database,
  );
  const questionProcessor = new AiQuestionProductionProcessor(
    new DrizzleQuestionProductionContextQuery(input.database),
    new FakeQuestionGenerationProvider(input.local?.questionFixtures ?? {}),
    new FakeQuestionCrossValidationProvider(),
    similarityLookup,
    questionRepository,
    questionRepository,
    {
      generationProvider: 'LOCAL_FAKE',
      generationModel: 'local-question-generation-v1',
      crossValidationProvider: 'LOCAL_FAKE',
      crossValidationModel: 'local-question-validation-v1',
    },
  );
  const processor = createContentProductionProcessorRouter({
    vocabulary: vocabularyProcessor,
    question: {
      process(workItem, signal) {
        return questionProcessor.process(
          workItem as Parameters<AiQuestionProductionProcessor['process']>[0],
          signal,
        );
      },
    },
  } satisfies Record<
    'vocabulary' | 'question',
    ContentProductionItemProcessor
  >);

  return {
    mode: input.mode,
    repository,
    processor,
    vocabularyProcessor,
    questionProcessor,
    similarityLookup,
    handler: createContentProductionDispatcher(repository, processor),
  };
};
