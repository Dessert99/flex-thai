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
});
