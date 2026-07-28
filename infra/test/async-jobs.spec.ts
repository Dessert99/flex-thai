/** queue 폭주와 poison message가 무제한 반복되지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ApplicationStack } from '../src/application-stack.js';
import { readInfrastructureConfig } from '../src/config.js';
import { DataStack } from '../src/data-stack.js';

const config = readInfrastructureConfig({
  account: '123456789012',
  rootDomain: 'example.com',
  hostedZoneId: 'Z0123456789EXAMPLE',
  alertEmail: 'owner@example.com',
  githubRepository: 'Dessert99/flex-thai',
  ttsVoicePresetId: '00000000-0000-4000-8000-000000000777',
  mediaPublicKeyPem:
    '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
});

type SynthesizedStateMachine = {
  Properties: {
    DefinitionString: unknown;
  };
};

describe('AsyncJobs', () => {
  it('4일 queue와 14일 DLQ를 최대 5회 재시도로 연결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncData');
    const stack = new ApplicationStack(app, 'AsyncApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SQS::Queue', {
      MessageRetentionPeriod: 345600,
      ReceiveMessageWaitTimeSeconds: 20,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
      SqsManagedSseEnabled: true,
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      MessageRetentionPeriod: 1209600,
      SqsManagedSseEnabled: true,
    });
    template.resourceCountIs('AWS::SQS::Queue', 4);
  });

  it('message 하나씩 Standard Workflow를 시작한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncWorkflowData');
    const stack = new ApplicationStack(app, 'AsyncWorkflow', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
    });
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineType: 'STANDARD',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 2,
      Timeout: 600,
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 2,
      Timeout: 60,
      Environment: {
        Variables: Match.objectLike({
          DATABASE_MODE: 'data-api',
          DATABASE_NAME: 'flex_thia',
        }),
      },
    });
  });

  it('lease 만료 뒤 transient 오류를 제한 재시도하고 recovery로 attempt를 종결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncRetryData');
    const stack = new ApplicationStack(app, 'AsyncRetryApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    const [stateMachine] = Object.values(
      template.findResources('AWS::StepFunctions::StateMachine') as Record<
        string,
        SynthesizedStateMachine
      >,
    );
    const definition = JSON.stringify(
      stateMachine?.Properties?.DefinitionString,
    );

    expect(definition.match(/\\"IntervalSeconds\\":960/gu)).toHaveLength(2);
    expect(definition).toContain('\\"MaxAttempts\\":3');
    expect(definition).toContain(
      '\\"Next\\":\\"WaitForExpiredContentProductionLease\\"',
    );
    expect(definition).toContain('\\"Seconds\\":960');
    expect(definition).toContain(
      '\\"Next\\":\\"RecoverContentProductionAttempt\\"',
    );
    expect(definition).toContain(
      '\\"Next\\":\\"MarkContentProductionAttemptFailed\\"',
    );
    expect(definition.match(/\\"IntervalSeconds\\":60/gu)).toHaveLength(1);
    expect(definition).toContain(
      '\\"Next\\":\\"ContentProductionWorkflowFailed\\"',
    );
    expect(definition).toContain(
      '\\"Error\\":\\"ContentProductionWorkflowFailed\\"',
    );
  });

  it('TTS queue는 partial batch 실패를 보고하고 task 동시성을 제한한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncTtsData');
    const stack = new ApplicationStack(app, 'AsyncTtsApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 10,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 300,
      ReservedConcurrentExecutions: 2,
      Environment: {
        Variables: Match.objectLike({
          DATABASE_MODE: 'data-api',
          MEDIA_BUCKET_NAME: Match.anyValue(),
        }),
      },
    });
  });

  it('relay와 TTS GC를 DB 접근·bounded concurrency·schedule로 실행한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncScheduleData');
    const stack = new ApplicationStack(app, 'AsyncScheduleApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 1,
      Environment: {
        Variables: Match.objectLike({
          DATABASE_MODE: 'data-api',
          CONTENT_PRODUCTION_QUEUE_URL: Match.anyValue(),
          TTS_QUEUE_URL: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 1,
      Environment: {
        Variables: Match.objectLike({
          DATABASE_MODE: 'data-api',
          MEDIA_BUCKET_NAME: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 minute)',
      State: 'ENABLED',
    });
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 hour)',
      State: 'ENABLED',
    });
  });

  it('relay와 TTS task·GC에 queue 및 reserved audio object 최소 권한만 준다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncIamData');
    const stack = new ApplicationStack(app, 'AsyncIamApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const templateJson = Template.fromStack(stack).toJSON();
    const policies = JSON.stringify(templateJson.Resources);

    expect(policies).toContain('sqs:SendMessage');
    expect(policies).toContain('s3:PutObject');
    expect(policies).toContain('s3:GetObject');
    expect(policies).toContain('s3:DeleteObject');
    expect(policies).toContain('private/tts/runs/*');
  });

  it('GC ListBucket 권한은 private TTS run prefix로만 제한한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncGcListData');
    const stack = new ApplicationStack(app, 'AsyncGcListApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const policies = Object.values(
      Template.fromStack(stack).findResources('AWS::IAM::Policy') as Record<
        string,
        {
          Properties: {
            PolicyDocument: {
              Statement: Array<Record<string, unknown>>;
            };
          };
        }
      >,
    );
    const statements = policies.flatMap(
      ({ Properties }) => Properties.PolicyDocument.Statement,
    );

    expect(statements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Action: 's3:ListBucket',
          Condition: {
            StringLike: {
              's3:prefix': 'private/tts/runs/*',
            },
          },
          Effect: 'Allow',
        }),
      ]),
    );
  });
});
