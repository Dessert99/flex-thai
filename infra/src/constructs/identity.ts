/** 학교 이메일 passwordless와 관리자 SMS의 AWS 자원을 묶는다 */
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as rds from 'aws-cdk-lib/aws-rds';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

/** custom auth trigger와 데이터·메일 경계를 연결하는 설정 */
export interface IdentityProps {
  defineChallengeEntry: string;
  createChallengeEntry: string;
  verifyChallengeEntry: string;
  cluster: rds.DatabaseCluster;
  clusterSecret: secretsmanager.ISecret;
  challengeHmacPepper: secretsmanager.ISecret;
  challengeSessionKey: secretsmanager.ISecret;
  emailIdentity: ses.IEmailIdentity;
  fromEmail: string;
  appUrl: string;
}

/** Cognito User Pool과 세 custom challenge trigger */
export class Identity extends Construct {
  /** API Gateway JWT issuer가 참조하는 User Pool */
  readonly userPool: cognito.UserPool;
  /** custom auth와 refresh token을 허용하는 App Client */
  readonly userPoolClient: cognito.UserPoolClient;
  /** challenge 흐름을 결정하는 Lambda */
  readonly defineChallengeFunction: nodejs.NodejsFunction;
  /** code와 link를 생성하고 SES로 보내는 Lambda */
  readonly createChallengeFunction: nodejs.NodejsFunction;
  /** 사용자가 제출한 code 또는 link를 검증하는 Lambda */
  readonly verifyChallengeFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      signInAliases: { email: true },
      selfSignUpEnabled: false,
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.defineChallengeFunction = this.createTrigger(
      'DefineChallenge',
      props.defineChallengeEntry,
    );
    this.createChallengeFunction = this.createTrigger(
      'CreateChallenge',
      props.createChallengeEntry,
      {
        DATABASE_MODE: 'data-api',
        DATABASE_NAME: 'flex_thia',
        RDS_RESOURCE_ARN: props.cluster.clusterArn,
        RDS_SECRET_ARN: props.clusterSecret.secretArn,
        CHALLENGE_SESSION_KEY_SECRET_ARN: props.challengeSessionKey.secretArn,
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: props.challengeHmacPepper.secretArn,
        SES_FROM_EMAIL: props.fromEmail,
        APP_URL: props.appUrl,
      },
    );
    this.verifyChallengeFunction = this.createTrigger(
      'VerifyChallenge',
      props.verifyChallengeEntry,
      {
        DATABASE_MODE: 'data-api',
        DATABASE_NAME: 'flex_thia',
        RDS_RESOURCE_ARN: props.cluster.clusterArn,
        RDS_SECRET_ARN: props.clusterSecret.secretArn,
        CHALLENGE_SESSION_KEY_SECRET_ARN: props.challengeSessionKey.secretArn,
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: props.challengeHmacPepper.secretArn,
      },
    );

    this.userPool.addTrigger(
      cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE,
      this.defineChallengeFunction,
    );
    this.userPool.addTrigger(
      cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE,
      this.createChallengeFunction,
    );
    this.userPool.addTrigger(
      cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE,
      this.verifyChallengeFunction,
    );
    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: { custom: true },
      accessTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      refreshTokenRotationGracePeriod: Duration.seconds(10),
      generateSecret: false,
    });
    const appClientResource = this.userPoolClient.node
      .defaultChild as cognito.CfnUserPoolClient;
    appClientResource.explicitAuthFlows = [
      'ALLOW_CUSTOM_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
    ];
    appClientResource.allowedOAuthFlows = undefined;
    appClientResource.allowedOAuthScopes = undefined;
    appClientResource.allowedOAuthFlowsUserPoolClient = false;
    appClientResource.callbackUrLs = undefined;
    appClientResource.logoutUrLs = undefined;

    for (const trigger of [
      this.createChallengeFunction,
      this.verifyChallengeFunction,
    ]) {
      props.cluster.grantDataApiAccess(trigger);
      props.clusterSecret.grantRead(trigger);
      props.challengeHmacPepper.grantRead(trigger);
      props.challengeSessionKey.grantRead(trigger);
    }
    props.emailIdentity.grant(this.createChallengeFunction, 'ses:SendEmail');
  }

  private createTrigger(
    id: string,
    entry: string,
    environment: Record<string, string> = {},
  ): nodejs.NodejsFunction {
    const logGroup = new logs.LogGroup(this, `${id}Logs`, {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    return new nodejs.NodejsFunction(this, id, {
      entry,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment,
      logGroup,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        format: nodejs.OutputFormat.ESM,
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
  }
}
