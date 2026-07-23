/** SQS at-least-once 전달을 deterministic Step Functions 실행으로 바꾼다 */
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { SQSEvent } from 'aws-lambda';

const parseMessage = (body: string): { jobId: string; attempt: number } => {
  const value = JSON.parse(body) as {
    jobId?: unknown;
    attempt?: unknown;
  };

  if (
    typeof value.jobId !== 'string' ||
    !Number.isInteger(value.attempt) ||
    Number(value.attempt) < 0
  ) {
    throw new Error('SQS Job message 형식이 잘못되었습니다');
  }

  return { jobId: value.jobId, attempt: Number(value.attempt) };
};

/** 같은 Job attempt는 Step Functions에서 한 번만 시작한다 */
export const createJobStarterHandler =
  (client: SFNClient, stateMachineArn: string) =>
  async (event: SQSEvent): Promise<void> => {
    for (const record of event.Records) {
      const message = parseMessage(record.body);

      try {
        await client.send(
          new StartExecutionCommand({
            stateMachineArn,
            name: `${message.jobId}-${message.attempt}`,
            input: JSON.stringify(message),
          }),
        );
      } catch (error) {
        if ((error as { name?: string }).name !== 'ExecutionAlreadyExists') {
          throw error;
        }
      }
    }
  };

let defaultHandler: ReturnType<typeof createJobStarterHandler> | undefined;

/** Lambda runtime에서 state machine ARN을 읽고 handler를 한 번만 만든다 */
export const handler = (event: SQSEvent): Promise<void> => {
  const stateMachineArn = process.env.JOB_STATE_MACHINE_ARN;

  if (!stateMachineArn) {
    return Promise.reject(
      new Error('JOB_STATE_MACHINE_ARN 환경 변수가 필요합니다'),
    );
  }

  defaultHandler ??= createJobStarterHandler(
    new SFNClient({}),
    stateMachineArn,
  );
  return defaultHandler(event);
};
