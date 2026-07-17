/** 서울 리전의 인증·API·비동기 애플리케이션 자원을 소유한다 */
import { fileURLToPath } from 'node:url';
import { Stack, type StackProps } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';
import type { InfrastructureConfig } from './config.js';
import { Identity } from './constructs/identity.js';
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
      appUrl: `https://app.${props.config.rootDomain}`,
    });
  }
}
