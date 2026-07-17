/** 작은 Job message만 SQS Standard Queue로 보내는 AWS adapter */
import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { JobQueue } from '@flex-thia/domain';

/** AWS SQS Standard Queue adapter */
export class SqsJobQueue implements JobQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  /** worker가 DB에서 최신 상태를 읽도록 식별자만 보낸다 */
  async send(message: { jobId: string; attempt: number }): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
      }),
    );
  }
}
