/** shared outbox sender를 local 직접 실행 또는 queue acceptance 경계로 조립한다 */
import type {
  AsyncDispatchMessage,
  AsyncDispatchSender,
} from './async-dispatch-outbox-relay.js';

/** queue transport가 실제 수락한 뒤에만 resolve하는 최소 port */
export interface AsyncDispatchQueueAcceptance {
  accept(input: {
    destination: 'CONTENT_PRODUCTION' | 'TTS';
    messageId: string;
    payload: AsyncDispatchMessage['payload'];
  }): Promise<void>;
}

/** production queue의 acceptance promise를 relay ack 의미로 보존한다 */
export class AcceptedQueueDispatchSender implements AsyncDispatchSender {
  constructor(
    private readonly queue: AsyncDispatchQueueAcceptance,
    private readonly destination: 'CONTENT_PRODUCTION' | 'TTS',
  ) {}

  /** queue가 message를 수락하기 전에 relay가 ack하지 못하게 promise를 그대로 전달한다 */
  send(message: AsyncDispatchMessage): Promise<void> {
    return this.queue.accept({ destination: this.destination, ...message });
  }
}

/** queue 미구성 production에서 outbox를 전달 완료로 오인하지 않게 한다 */
export class UnavailableAsyncDispatchSender implements AsyncDispatchSender {
  /** relay release/redelivery로 수렴하도록 항상 안정 오류를 반환한다 */
  send(_message: AsyncDispatchMessage): Promise<never> {
    void _message;
    return Promise.reject(new Error('ASYNC_DISPATCH_QUEUE_UNAVAILABLE'));
  }
}

/** local DB outbox도 production과 같은 payload를 실제 handler까지 기다린다 */
export const createLocalAsyncDispatchSenders = (input: {
  contentProductionHandler: (
    message: AsyncDispatchMessage['payload'],
  ) => Promise<unknown>;
  ttsHandler: (message: AsyncDispatchMessage['payload']) => Promise<unknown>;
}): Record<'CONTENT_PRODUCTION' | 'TTS', AsyncDispatchSender> => ({
  CONTENT_PRODUCTION: {
    async send(message) {
      await input.contentProductionHandler(message.payload);
    },
  },
  TTS: {
    async send(message) {
      const result = await input.ttsHandler(message.payload);
      if (
        result !== null &&
        typeof result === 'object' &&
        'kind' in result &&
        result.kind === 'MALFORMED'
      ) {
        throw new Error('ASYNC_DISPATCH_LOCAL_MESSAGE_REJECTED');
      }
    },
  },
});
