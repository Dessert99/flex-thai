/** 운영 장애와 비용 초과를 이메일로 알리고 일반 설정을 보관한다 */
import { Duration } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as rds from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import type { InfrastructureConfig } from '../config.js';
import type { AsyncJobs } from './async-jobs.js';
import type { HttpApi } from './http-api.js';

/** 감시할 애플리케이션 자원과 production 설정 */
export interface ObservabilityProps {
  config: InfrastructureConfig;
  cluster: rds.DatabaseCluster;
  httpApi: HttpApi;
  asyncJobs: AsyncJobs;
}

/** CloudWatch 알람, Parameter Store, 월 비용 예산 경계 */
export class Observability extends Construct {
  /** 모든 운영 알람이 이메일을 보내는 SNS topic */
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ObservabilityProps) {
    super(scope, id);

    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: 'FLEX THIA production alarms',
    });
    this.alarmTopic.addSubscription(
      new subscriptions.EmailSubscription(props.config.alertEmail),
    );

    const addAlarm = (
      id: string,
      metric: cloudwatch.IMetric,
      options: Omit<cloudwatch.AlarmProps, 'metric'>,
    ): void => {
      const alarm = new cloudwatch.Alarm(this, id, {
        metric,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        ...options,
      });
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
    };
    const countAlarmOptions = {
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    } satisfies Omit<cloudwatch.AlarmProps, 'metric'>;

    addAlarm(
      'ApiGateway5xxAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: {
          ApiId: props.httpApi.api.apiId,
          Stage: '$default',
        },
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      countAlarmOptions,
    );
    addAlarm(
      'ApiFunctionErrorsAlarm',
      props.httpApi.apiFunction.metricErrors({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      countAlarmOptions,
    );
    addAlarm(
      'ApiFunctionThrottlesAlarm',
      props.httpApi.apiFunction.metricThrottles({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      countAlarmOptions,
    );
    addAlarm(
      'ApiFunctionDurationAlarm',
      props.httpApi.apiFunction.metricDuration({
        period: Duration.minutes(5),
        statistic: 'Maximum',
      }),
      {
        threshold: 28_000,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      },
    );

    for (const [name, worker] of [
      ['JobStarter', props.asyncJobs.jobStarterFunction],
      ['FoundationWorker', props.asyncJobs.foundationFunction],
    ] as const) {
      addAlarm(
        `${name}ErrorsAlarm`,
        worker.metricErrors({
          period: Duration.minutes(5),
          statistic: 'Sum',
        }),
        countAlarmOptions,
      );
      addAlarm(
        `${name}ThrottlesAlarm`,
        worker.metricThrottles({
          period: Duration.minutes(5),
          statistic: 'Sum',
        }),
        countAlarmOptions,
      );
    }

    addAlarm(
      'OldestJobMessageAlarm',
      props.asyncJobs.queue.metricApproximateAgeOfOldestMessage({
        period: Duration.minutes(5),
        statistic: 'Maximum',
      }),
      {
        threshold: 300,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      },
    );
    addAlarm(
      'DeadLetterQueueAlarm',
      props.asyncJobs.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: 'Maximum',
      }),
      countAlarmOptions,
    );
    addAlarm(
      'WorkflowFailedAlarm',
      props.asyncJobs.stateMachine.metricFailed({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      countAlarmOptions,
    );
    addAlarm(
      'AuroraCapacityAlarm',
      props.cluster.metricServerlessDatabaseCapacity({
        period: Duration.minutes(5),
        statistic: 'Average',
      }),
      {
        threshold: 2,
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      },
    );

    for (const metricName of ['Bounce', 'Complaint'] as const) {
      addAlarm(
        `Ses${metricName}Alarm`,
        new cloudwatch.Metric({
          namespace: 'AWS/SES',
          metricName,
          statistic: 'Sum',
          period: Duration.minutes(5),
        }),
        countAlarmOptions,
      );
    }
    addAlarm(
      'SnsDeliveryFailureAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/SNS',
        metricName: 'NumberOfNotificationsFailed',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      countAlarmOptions,
    );

    const parameters: Record<string, string> = {
      'auth/allowed-email-domains': props.config.allowedEmailDomains,
      'auth/challenge-ttl-seconds': '600',
      'auth/step-up-ttl-seconds': '300',
      'jobs/map-max-concurrency': '2',
      'jobs/provider-max-concurrency': '1',
      'uploads/max-file-bytes': '26214400',
      'uploads/max-job-bytes': '262144000',
    };
    for (const [name, value] of Object.entries(parameters)) {
      new ssm.StringParameter(this, `Parameter${name.replaceAll('/', '-')}`, {
        parameterName: `/flex-thia/prod/${name}`,
        stringValue: value,
      });
    }

    const emailSubscriber: budgets.CfnBudget.SubscriberProperty = {
      address: props.config.alertEmail,
      subscriptionType: 'EMAIL',
    };
    const notification = (
      notificationType: 'ACTUAL' | 'FORECASTED',
      threshold: number,
    ): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: {
        comparisonOperator: 'GREATER_THAN',
        notificationType,
        threshold,
        thresholdType: 'PERCENTAGE',
      },
      subscribers: [emailSubscriber],
    });
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'flex-thia-prod-monthly',
        budgetLimit: {
          amount: props.config.monthlyBudgetUsd,
          unit: 'USD',
        },
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
      },
      notificationsWithSubscribers: [
        notification('ACTUAL', 50),
        notification('ACTUAL', 80),
        notification('ACTUAL', 100),
        notification('FORECASTED', 100),
      ],
    });
  }
}
