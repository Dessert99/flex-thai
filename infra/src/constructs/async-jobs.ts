/** API가 접수한 Job을 추적 가능한 Standard Workflow로 넘긴다 */
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as rds from 'aws-cdk-lib/aws-rds';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

/** worker bundle과 Aurora 권한을 workflow에 연결하는 설정 */
export interface AsyncJobsProps {
  jobStarterEntry: string;
  foundationEntry: string;
  cluster: rds.DatabaseCluster;
  clusterSecret: secretsmanager.ISecret;
}

/** SQS, DLQ, worker Lambda, Step Functions 기초 흐름 */
export class AsyncJobs extends Construct {
  /** API가 jobId를 보내는 Standard Queue */
  readonly queue: sqs.Queue;
  /** 최대 재시도 뒤 poison message를 격리하는 Queue */
  readonly deadLetterQueue: sqs.Queue;
  /** 실행 이력을 보존하는 Standard Workflow */
  readonly stateMachine: sfn.StateMachine;
  /** SQS message를 workflow 실행으로 바꾸는 Lambda */
  readonly jobStarterFunction: nodejs.NodejsFunction;
  /** foundation Job 상태 전이를 실행하는 Lambda */
  readonly foundationFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AsyncJobsProps) {
    super(scope, id);

    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    this.queue = new sqs.Queue(this, 'JobQueue', {
      retentionPeriod: Duration.days(4),
      receiveMessageWaitTime: Duration.seconds(20),
      visibilityTimeout: Duration.seconds(60),
      enforceSSL: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 5,
      },
    });
    this.foundationFunction = this.createWorker(
      'FoundationTask',
      props.foundationEntry,
      {
        DATABASE_MODE: 'data-api',
        DATABASE_NAME: 'flex_thia',
        RDS_RESOURCE_ARN: props.cluster.clusterArn,
        RDS_SECRET_ARN: props.clusterSecret.secretArn,
      },
    );
    const definition = new tasks.LambdaInvoke(this, 'RunFoundationTask', {
      lambdaFunction: this.foundationFunction,
      payloadResponseOnly: true,
    });
    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      logs: {
        destination: new logs.LogGroup(this, 'WorkflowLogs', {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });
    this.jobStarterFunction = this.createWorker(
      'JobStarter',
      props.jobStarterEntry,
      {
        STATE_MACHINE_ARN: this.stateMachine.stateMachineArn,
      },
    );
    this.jobStarterFunction.addEventSource(
      new eventSources.SqsEventSource(this.queue, { batchSize: 1 }),
    );
    this.stateMachine.grantStartExecution(this.jobStarterFunction);
    props.cluster.grantDataApiAccess(this.foundationFunction);
    props.clusterSecret.grantRead(this.foundationFunction);
  }

  private createWorker(
    id: string,
    entry: string,
    environment: Record<string, string>,
  ): nodejs.NodejsFunction {
    return new nodejs.NodejsFunction(this, id, {
      entry,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(60),
      memorySize: 512,
      reservedConcurrentExecutions: 2,
      environment,
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      bundling: {
        externalModules: ['@aws-sdk/*'],
        format: nodejs.OutputFormat.ESM,
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
  }
}
