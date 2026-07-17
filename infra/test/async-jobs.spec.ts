/** queue 폭주와 poison message가 무제한 반복되지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
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

describe('AsyncJobs', () => {
  it('4일 queue와 14일 DLQ를 최대 5회 재시도로 연결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AsyncData');
    const stack = new ApplicationStack(app, 'AsyncApplication', {
      config,
      dataStack,
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
      Timeout: 60,
    });
  });
});
