/** 공개 인증과 보호 API를 Lambda·HTTP API로 연결한다 */
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as rds from 'aws-cdk-lib/aws-rds';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

/** API bundle과 AWS 자원별 최소 권한을 연결하는 설정 */
export interface HttpApiProps {
  apiAssetPath: string;
  allowedOrigins: string[];
  allowedEmailDomains: string;
  cluster: rds.DatabaseCluster;
  clusterSecret: secretsmanager.ISecret;
  challengeHmacPepper: secretsmanager.ISecret;
  challengeSessionKey: secretsmanager.ISecret;
  inputBucket: s3.IBucket;
  jobQueue: sqs.IQueue;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

/** API Lambda와 route별 JWT 경계를 소유한다 */
export class HttpApi extends Construct {
  /** API Gateway가 호출하는 NestJS Lambda */
  readonly apiFunction: lambda.Function;
  /** 공개 URL을 제공하는 HTTP API */
  readonly api: apigwv2.HttpApi;
  /** API Gateway access log group */
  readonly accessLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: HttpApiProps) {
    super(scope, id);

    const functionLogs = new logs.LogGroup(this, 'FunctionLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.apiFunction = new lambda.Function(this, 'Function', {
      code: lambda.Code.fromAsset(props.apiAssetPath),
      handler: 'lambda.handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(29),
      memorySize: 1024,
      reservedConcurrentExecutions: 5,
      logGroup: functionLogs,
      environment: {
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        DATABASE_NAME: 'flex_thia',
        RDS_RESOURCE_ARN: props.cluster.clusterArn,
        RDS_SECRET_ARN: props.clusterSecret.secretArn,
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClient.userPoolClientId,
        INPUT_BUCKET_NAME: props.inputBucket.bucketName,
        JOB_QUEUE_URL: props.jobQueue.queueUrl,
        CHALLENGE_SESSION_KEY_SECRET_ARN: props.challengeSessionKey.secretArn,
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: props.challengeHmacPepper.secretArn,
        SCHOOL_EMAIL_DOMAINS: props.allowedEmailDomains,
        ALLOWED_ORIGINS: props.allowedOrigins.join(','),
      },
    });
    props.cluster.grantDataApiAccess(this.apiFunction);
    props.clusterSecret.grantRead(this.apiFunction);
    props.challengeHmacPepper.grantRead(this.apiFunction);
    props.challengeSessionKey.grantRead(this.apiFunction);
    props.inputBucket.grantReadWrite(this.apiFunction, 'inputs/*');
    props.jobQueue.grantSendMessages(this.apiFunction);
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminGetUser', 'cognito-idp:AdminCreateUser'],
        resources: [props.userPool.userPoolArn],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:InitiateAuth',
          'cognito-idp:RespondToAuthChallenge',
          'cognito-idp:RevokeToken',
          'cognito-idp:GetUser',
          'cognito-idp:UpdateUserAttributes',
          'cognito-idp:GetUserAttributeVerificationCode',
          'cognito-idp:VerifyUserAttribute',
        ],
        resources: ['*'],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: ['*'],
      }),
    );

    this.api = new apigwv2.HttpApi(this, 'Gateway', {
      corsPreflight: {
        allowOrigins: props.allowedOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowHeaders: [
          'authorization',
          'content-type',
          'x-csrf-protection',
          'x-step-up-token',
        ],
        allowCredentials: true,
        maxAge: Duration.hours(1),
      },
    });
    const integration = new integrations.HttpLambdaIntegration(
      'ApiIntegration',
      this.apiFunction,
    );
    const authorizer = new authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] },
    );

    for (const [method, path] of [
      [apigwv2.HttpMethod.GET, '/health'],
      [apigwv2.HttpMethod.GET, '/ready'],
      [apigwv2.HttpMethod.POST, '/auth/challenges'],
      [apigwv2.HttpMethod.POST, '/auth/challenges/{challengeId}/code'],
      [apigwv2.HttpMethod.POST, '/auth/challenges/{challengeId}/link'],
      [apigwv2.HttpMethod.POST, '/auth/refresh'],
      [apigwv2.HttpMethod.POST, '/auth/logout'],
    ] as const) {
      this.api.addRoutes({ path, methods: [method], integration });
    }
    for (const [method, path] of [
      [apigwv2.HttpMethod.POST, '/auth/phone/challenges'],
      [apigwv2.HttpMethod.POST, '/auth/phone/challenges/{challengeId}/verify'],
      [apigwv2.HttpMethod.POST, '/auth/step-up/challenges'],
      [
        apigwv2.HttpMethod.POST,
        '/auth/step-up/challenges/{challengeId}/verify',
      ],
      [apigwv2.HttpMethod.POST, '/uploads/policies'],
      [apigwv2.HttpMethod.POST, '/uploads/{uploadId}/complete'],
      [apigwv2.HttpMethod.POST, '/jobs'],
      [apigwv2.HttpMethod.GET, '/jobs/{jobId}'],
    ] as const) {
      this.api.addRoutes({
        path,
        methods: [method],
        integration,
        authorizer,
      });
    }

    this.accessLogGroup = new logs.LogGroup(this, 'AccessLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.accessLogGroup.grantWrite(
      new iam.ServicePrincipal('apigateway.amazonaws.com'),
    );
    const stage = this.api.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    stage.defaultRouteSettings = {
      throttlingBurstLimit: 10,
      throttlingRateLimit: 5,
    };
    stage.accessLogSettings = {
      destinationArn: this.accessLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        routeKey: '$context.routeKey',
        status: '$context.status',
        responseLatency: '$context.responseLatency',
      }),
    };

    new CfnOutput(this, 'ApiUrl', { value: this.api.apiEndpoint });
  }
}
