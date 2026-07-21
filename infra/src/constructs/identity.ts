/** 학교 이메일 비밀번호 계정과 관리자 전화번호 검증의 Cognito 경계를 만든다 */
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/** 공개 자가 가입 없이 서버 관리자 명령만 사용하는 Cognito User Pool */
export class Identity extends Construct {
  /** API Gateway JWT issuer가 참조하는 User Pool */
  readonly userPool: cognito.UserPool;
  /** 서버 전용 비밀번호 인증과 refresh만 허용하는 App Client */
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      signInAliases: { email: true },
      selfSignUpEnabled: false,
      accountRecovery: cognito.AccountRecovery.NONE,
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
    });
    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: { adminUserPassword: true },
      accessTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      refreshTokenRotationGracePeriod: Duration.seconds(10),
      generateSecret: false,
    });
    const client = this.userPoolClient.node
      .defaultChild as cognito.CfnUserPoolClient;
    client.explicitAuthFlows = ['ALLOW_ADMIN_USER_PASSWORD_AUTH'];
    client.allowedOAuthFlows = undefined;
    client.allowedOAuthScopes = undefined;
    client.allowedOAuthFlowsUserPoolClient = false;
    client.callbackUrLs = undefined;
    client.logoutUrLs = undefined;
  }
}
