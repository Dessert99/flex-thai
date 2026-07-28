/** shared outbox relay Lambda를 DB와 mode별 CONTENT_PRODUCTION·TTS sender에 연결한다 */
import {
  DrizzleAsyncDispatchOutboxRepository,
  DrizzleContentProductionRepository,
} from '@flex-thia/database';
import { createContentProductionRuntime } from '../content-production/content-production-runtime.js';
import { createWorkerDatabase } from '../database-runtime.js';
import { createTtsRuntime } from '../media/tts-runtime.js';
import { AsyncDispatchOutboxRelay } from './async-dispatch-outbox-relay.js';
import {
  AcceptedQueueDispatchSender,
  UnavailableAsyncDispatchSender,
  createLocalAsyncDispatchSenders,
  type AsyncDispatchQueueAcceptance,
} from './async-dispatch-runtime.js';

/** relay runtime의 외부 side effect mode와 optional queue acceptance adapter */
export interface AsyncDispatchRelayRuntimeConfig {
  database: ConstructorParameters<typeof DrizzleContentProductionRepository>[0];
  mode: 'local' | 'test' | 'production';
  queues?: Partial<
    Record<'CONTENT_PRODUCTION' | 'TTS', AsyncDispatchQueueAcceptance>
  >;
}

/** schedule event가 한 bounded outbox drain에 전달하는 조정값 */
export interface AsyncDispatchRelayTaskInput {
  workerId?: string;
  batchSize?: number;
  leaseDurationMs?: number;
  retryDelayMs?: number;
}

/** local은 handler 직접 실행, production은 queue acceptance 뒤 ack로 조립한다 */
export const createAsyncDispatchRelayRuntime = (
  input: AsyncDispatchRelayRuntimeConfig,
) => {
  const repository = new DrizzleAsyncDispatchOutboxRepository(input.database);
  const senders =
    input.mode === 'production'
      ? {
          CONTENT_PRODUCTION: input.queues?.CONTENT_PRODUCTION
            ? new AcceptedQueueDispatchSender(
                input.queues.CONTENT_PRODUCTION,
                'CONTENT_PRODUCTION',
              )
            : new UnavailableAsyncDispatchSender(),
          TTS: input.queues?.TTS
            ? new AcceptedQueueDispatchSender(input.queues.TTS, 'TTS')
            : new UnavailableAsyncDispatchSender(),
        }
      : createLocalAsyncDispatchSenders({
          contentProductionHandler: createContentProductionRuntime({
            database: input.database,
            mode: input.mode,
          }).handler,
          ttsHandler: createTtsRuntime({
            database: input.database as unknown as Parameters<
              typeof createTtsRuntime
            >[0]['database'],
            mode: input.mode,
          }).taskHandler,
        });
  const relay = new AsyncDispatchOutboxRelay(repository, senders);

  return {
    repository,
    senders,
    relay,
    handler: (task: AsyncDispatchRelayTaskInput = {}) =>
      relay.drainOnce({
        workerId:
          task.workerId ??
          process.env.AWS_LAMBDA_LOG_STREAM_NAME ??
          'async-dispatch-relay',
        ...(task.batchSize === undefined ? {} : { batchSize: task.batchSize }),
        ...(task.leaseDurationMs === undefined
          ? {}
          : { leaseDurationMs: task.leaseDurationMs }),
        ...(task.retryDelayMs === undefined
          ? {}
          : { retryDelayMs: task.retryDelayMs }),
      }),
  };
};

let defaultHandler:
  ReturnType<typeof createAsyncDispatchRelayRuntime>['handler'] | undefined;

/** production queue 미구성 시 row를 ack하지 않고 안전하게 release한다 */
export const handler = (input: AsyncDispatchRelayTaskInput = {}) => {
  defaultHandler ??= createAsyncDispatchRelayRuntime({
    database: createWorkerDatabase(),
    mode: process.env.DATABASE_MODE === 'local' ? 'local' : 'production',
  }).handler;
  return defaultHandler(input);
};
