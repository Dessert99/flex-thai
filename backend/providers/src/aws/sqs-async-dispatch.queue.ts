/** shared outbox delivery를 목적지별 SQS Standard Queue 수락으로 연결한다 */
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

/** relay와 provider 사이의 queue 수락 입력 */
export interface SqsAsyncDispatchAcceptanceInput {
  destination: 'CONTENT_PRODUCTION' | 'TTS';
  messageId: string;
  payload: { jobId: string; attempt: number };
}

/** production relay용 목적지별 SQS adapter 생성 입력 */
export interface CreateSqsAsyncDispatchQueueInput {
  region: string;
  queueUrl: string;
  destination: SqsAsyncDispatchAcceptanceInput['destination'];
}

/** AWS client 생성도 provider 경계 안에 두고 목적지별 queue adapter를 만든다 */
export const createSqsAsyncDispatchQueue = (
  input: CreateSqsAsyncDispatchQueueInput,
): SqsAsyncDispatchQueue =>
  new SqsAsyncDispatchQueue(
    new SQSClient({ region: input.region }),
    input.queueUrl,
    input.destination,
  );

/** 한 목적지의 queue URL만 소유해 교차 전송을 막는 SQS adapter */
export class SqsAsyncDispatchQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly destination: SqsAsyncDispatchAcceptanceInput['destination'],
  ) {}

  /** SQS가 message를 수락한 뒤에만 relay promise를 완료한다 */
  async accept(input: SqsAsyncDispatchAcceptanceInput): Promise<void> {
    if (input.destination !== this.destination) {
      throw new Error('ASYNC_DISPATCH_DESTINATION_MISMATCH');
    }
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(input.payload),
        MessageAttributes: {
          DispatchMessageId: {
            DataType: 'String',
            StringValue: input.messageId,
          },
        },
      }),
    );
  }
}
