/** Step Functions 전달을 콘텐츠 제작 dispatcher와 실제 adapter에 연결한다 */
import { DrizzleContentProductionRepository } from '@flex-thia/database';
import { createWorkerDatabase } from './database-runtime.js';
import {
  createContentProductionDispatcher,
  type ContentProductionItemProcessor,
  type ContentProductionWorkerRepository,
} from './content-production/content-production-dispatcher.js';
import { UnavailableContentProductionProcessor } from './content-production/unavailable-content-production.processor.js';

/** 테스트 가능한 조립 경계에서 콘텐츠 제작 dispatcher를 생성한다 */
export const createContentProductionTaskHandler = (
  repository: ContentProductionWorkerRepository,
  processor: ContentProductionItemProcessor,
) => createContentProductionDispatcher(repository, processor);

let defaultHandler:
  ReturnType<typeof createContentProductionTaskHandler> | undefined;

/** Lambda cold start마다 실제 DB repository와 안전한 운영 fallback을 한 번 조립한다 */
export const handler = (input: { jobId: string; attempt: number }) => {
  defaultHandler ??= createContentProductionTaskHandler(
    new DrizzleContentProductionRepository(createWorkerDatabase()),
    new UnavailableContentProductionProcessor(),
  );

  return defaultHandler(input);
};
