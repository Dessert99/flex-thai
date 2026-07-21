/** 비용과 poison message를 운영자가 놓치지 않게 고정한다 */
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

describe('Observability', () => {
  it('월 예산 30 USD의 실제·예상 비용 알림을 만든다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'ObservabilityData');
    const template = Template.fromStack(
      new ApplicationStack(app, 'ObservabilityApplication', {
        config,
        dataStack,
      }),
    );

    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetLimit: { Amount: 30, Unit: 'USD' },
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
      },
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: {
            ComparisonOperator: 'GREATER_THAN',
            NotificationType: 'ACTUAL',
            Threshold: 50,
            ThresholdType: 'PERCENTAGE',
          },
        }),
        Match.objectLike({
          Notification: {
            ComparisonOperator: 'GREATER_THAN',
            NotificationType: 'FORECASTED',
            Threshold: 100,
            ThresholdType: 'PERCENTAGE',
          },
        }),
      ]),
    });
  });

  it('DLQ와 핵심 장애 지표를 운영자 이메일 topic에 연결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'AlarmData');
    const template = Template.fromStack(
      new ApplicationStack(app, 'AlarmApplication', {
        config,
        dataStack,
      }),
    );

    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Endpoint: 'owner@example.com',
      Protocol: 'email',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Threshold: 0,
      ComparisonOperator: 'GreaterThanThreshold',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: '5xx',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'ServerlessDatabaseCapacity',
    });
  });

  it('인증 발송 상한을 포함한 운영 설정 열 개를 Parameter Store에 둔다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'ParameterData');
    const template = Template.fromStack(
      new ApplicationStack(app, 'ParameterApplication', {
        config,
        dataStack,
      }),
    );

    template.resourceCountIs('AWS::SSM::Parameter', 10);
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/flex-thia/prod/auth/allowed-email-domains',
      Value: 'hufs.ac.kr',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/flex-thia/prod/auth/challenge-global-daily-limit',
      Value: '500',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/flex-thia/prod/jobs/map-max-concurrency',
      Value: '2',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/flex-thia/prod/uploads/max-job-bytes',
      Value: '262144000',
    });
  });
});
