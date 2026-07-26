/** 학교 이메일 확인용 Cognito Custom Auth 경계를 만든다 */
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/** Custom Auth trigger bundle 위치 */
export interface IdentityProps {
  createAuthChallengeEntry: string;
  defineAuthChallengeEntry: string;
  verifyAuthChallengeEntry: string;
}

/** 공개 자가 가입 없이 학교 이메일 Custom Auth만 사용하는 Cognito User Pool */
export class Identity extends Construct {
  /** API Gateway JWT issuer가 참조하는 User Pool */
  readonly userPool: cognito.UserPool;
  /** Custom Auth와 refresh만 허용하는 App Client */
  readonly userPoolClient: cognito.UserPoolClient;
  /** API와 Create Auth Challenge가 함께 사용하는 HMAC secret */
  readonly customAuthSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);

    this.customAuthSecret = new secretsmanager.Secret(
      this,
      'CustomAuthSecret',
      {
        generateSecretString: {
          excludePunctuation: true,
          passwordLength: 48,
        },
        removalPolicy: RemovalPolicy.RETAIN,
      },
    );
    const defineAuthChallenge = this.createTrigger(
      'DefineAuthChallenge',
      props.defineAuthChallengeEntry,
      'defineAuthChallenge',
    );
    const createAuthChallenge = this.createTrigger(
      'CreateAuthChallenge',
      props.createAuthChallengeEntry,
      'createAuthChallenge',
      { CUSTOM_AUTH_SECRET_ARN: this.customAuthSecret.secretArn },
    );
    this.customAuthSecret.grantRead(createAuthChallenge);
    const verifyAuthChallenge = this.createTrigger(
      'VerifyAuthChallenge',
      props.verifyAuthChallengeEntry,
      'verifyAuthChallenge',
    );

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      signInAliases: { email: true },
      selfSignUpEnabled: false,
      accountRecovery: cognito.AccountRecovery.NONE,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      enableSmsRole: true,
      // 서울 Cognito SMS는 AWS 규칙상 도쿄 SNS 리전만 사용할 수 있다.
      snsRegion: 'ap-northeast-1',
      removalPolicy: RemovalPolicy.RETAIN,
      lambdaTriggers: {
        defineAuthChallenge,
        createAuthChallenge,
        verifyAuthChallengeResponse: verifyAuthChallenge,
      },
    });
    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: { custom: true },
      accessTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(7),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      refreshTokenRotationGracePeriod: Duration.seconds(10),
      generateSecret: false,
    });
    const client = this.userPoolClient.node
      .defaultChild as cognito.CfnUserPoolClient;
    client.explicitAuthFlows = [
      'ALLOW_CUSTOM_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
    ];
    client.refreshTokenValidity = 7;
    client.tokenValidityUnits = {
      accessToken: 'minutes',
      refreshToken: 'days',
    };
    client.allowedOAuthFlows = undefined;
    client.allowedOAuthScopes = undefined;
    client.allowedOAuthFlowsUserPoolClient = false;
    client.callbackUrLs = undefined;
    client.logoutUrLs = undefined;
  }

  private createTrigger(
    id: string,
    entry: string,
    handler: string,
    environment?: Record<string, string>,
  ): nodejs.NodejsFunction {
    return new nodejs.NodejsFunction(this, id, {
      entry,
      handler,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment,
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.TWO_WEEKS,
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
