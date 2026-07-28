/** TTS Lambda가 SQS record body를 direct task handler와 부분 batch 응답으로 변환한다 */
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { getDefaultTtsEntryRuntime } from './tts-entry-runtime.js';
import type { createTtsRuntime } from './tts-runtime.js';

type TtsDirectHandler = ReturnType<typeof createTtsRuntime>['taskHandler'];

/** malformed JSON은 terminal ACK하고 실행 예외만 record 단위 재전달한다 */
export const createTtsSqsHandler =
  (getDirectHandler: () => TtsDirectHandler) =>
  async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const outcomes = await Promise.all(
      event.Records.map(async (record) => {
        let message: unknown;
        try {
          message = JSON.parse(record.body) as unknown;
        } catch {
          return null;
        }
        try {
          await getDirectHandler()(message);
          return null;
        } catch {
          return { itemIdentifier: record.messageId };
        }
      }),
    );
    return {
      batchItemFailures: outcomes.filter(
        (outcome): outcome is { itemIdentifier: string } => outcome !== null,
      ),
    };
  };

/** TTS SQS batch를 shared cold-start runtime의 direct handler로 처리한다 */
export const handler = createTtsSqsHandler(
  () => getDefaultTtsEntryRuntime().taskHandler,
);
