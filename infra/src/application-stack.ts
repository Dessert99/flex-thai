/** 서울 리전의 인증·API·비동기 애플리케이션 자원을 소유한다 */
import { fileURLToPath } from 'node:url';
import { Stack, type StackProps } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';
import type { InfrastructureConfig } from './config.js';
import { AsyncJobs } from './constructs/async-jobs.js';
import { HttpApi } from './constructs/http-api.js';
import { Identity } from './constructs/identity.js';
import { Observability } from './constructs/observability.js';
import type { DataStack } from './data-stack.js';

/** ApplicationStack이 장기 데이터 자원을 참조하는 설정 */
export interface ApplicationStackProps extends StackProps {
  config: InfrastructureConfig;
  dataStack: DataStack;
}

/** Cognito, Lambda, API Gateway, workflow를 배치할 서울 Stack */
export class ApplicationStack extends Stack {
  /** 학교 이메일 passwordless identity 경계 */
  readonly identity: Identity;
  /** SQS와 Step Functions 비동기 Job 경계 */
  readonly asyncJobs: AsyncJobs;
  /** Lambda와 route별 JWT를 연결하는 HTTP API 경계 */
  readonly httpApi: HttpApi;
  /** 장애 알람, 일반 설정, 월 비용 예산 경계 */
  readonly observability: Observability;

  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    const hostedZone = route53.PublicHostedZone.fromPublicHostedZoneAttributes(
      this,
      'HostedZone',
      {
        hostedZoneId: props.config.hostedZoneId,
        zoneName: props.config.rootDomain,
      },
    );
    const webDomain = `www.${props.config.rootDomain}`;
    const apiDomain = `api.${props.config.rootDomain}`;
    const emailIdentity = new ses.EmailIdentity(this, 'EmailIdentity', {
      identity: ses.Identity.publicHostedZone(hostedZone),
    });
    const workerSource = fileURLToPath(
      new URL('../../apps/worker/src/auth/', import.meta.url),
    );

    this.identity = new Identity(this, 'Identity', {
      defineChallengeEntry: `${workerSource}define-auth-challenge.ts`,
      createChallengeEntry: `${workerSource}create-auth-challenge.ts`,
      verifyChallengeEntry: `${workerSource}verify-auth-challenge.ts`,
      cluster: props.dataStack.cluster,
      clusterSecret: props.dataStack.clusterSecret,
      challengeHmacPepper: props.dataStack.challengeHmacPepper,
      challengeSessionKey: props.dataStack.challengeSessionKey,
      emailIdentity,
      fromEmail: `no-reply@${props.config.rootDomain}`,
      appUrl: `https://${webDomain}`,
    });
    const workerRoot = fileURLToPath(
      new URL('../../apps/worker/src/', import.meta.url),
    );
    this.asyncJobs = new AsyncJobs(this, 'AsyncJobs', {
      jobStarterEntry: `${workerRoot}job-starter.ts`,
      foundationEntry: `${workerRoot}foundation-task.ts`,
      cluster: props.dataStack.cluster,
      clusterSecret: props.dataStack.clusterSecret,
    });
    const apiAssetPath = fileURLToPath(
      new URL('../../apps/api/dist/', import.meta.url),
    );
    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiAssetPath,
      allowedOrigins: [`https://${webDomain}`, 'http://localhost:5173'],
      allowedEmailDomains: props.config.allowedEmailDomains,
      domainName: apiDomain,
      hostedZone,
      cluster: props.dataStack.cluster,
      clusterSecret: props.dataStack.clusterSecret,
      challengeHmacPepper: props.dataStack.challengeHmacPepper,
      challengeSessionKey: props.dataStack.challengeSessionKey,
      inputBucket: props.dataStack.inputBucket,
      jobQueue: this.asyncJobs.queue,
      userPool: this.identity.userPool,
      userPoolClient: this.identity.userPoolClient,
    });
    this.observability = new Observability(this, 'Observability', {
      config: props.config,
      cluster: props.dataStack.cluster,
      httpApi: this.httpApi,
      asyncJobs: this.asyncJobs,
    });
  }
}
