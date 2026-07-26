/** 공개 인증과 보호 API를 Lambda·HTTP API로 연결한다 */
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type * as ses from 'aws-cdk-lib/aws-ses';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

/** API bundle과 AWS 자원별 최소 권한을 연결하는 설정 */
export interface HttpApiProps {
  apiAssetPath: string;
  allowedOrigins: string[];
  allowedEmailDomains: string;
  domainName: string;
  hostedZone: route53.IHostedZone;
  cluster: rds.DatabaseCluster;
  clusterSecret: secretsmanager.ISecret;
  challengeHmacPepper: secretsmanager.ISecret;
  customAuthSecret: secretsmanager.ISecret;
  emailIdentity: ses.IEmailIdentity;
  emailLinkConfirmationUrl: string;
  fromEmail: string;
  inputBucket: s3.IBucket;
  jobQueue: sqs.IQueue;
  mediaBucket: s3.IBucket;
  mediaCdnBaseUrl: string;
  mediaKeyPairId: string;
  mediaPrivateKey: secretsmanager.ISecret;
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
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: props.challengeHmacPepper.secretArn,
        CUSTOM_AUTH_SECRET_ARN: props.customAuthSecret.secretArn,
        SCHOOL_EMAIL_DOMAINS: props.allowedEmailDomains,
        EMAIL_LINK_CONFIRMATION_URL: props.emailLinkConfirmationUrl,
        FROM_EMAIL: props.fromEmail,
        MEDIA_BUCKET_NAME: props.mediaBucket.bucketName,
        MEDIA_CDN_BASE_URL: props.mediaCdnBaseUrl,
        MEDIA_KEY_PAIR_ID: props.mediaKeyPairId,
        MEDIA_PRIVATE_KEY_SECRET_ARN: props.mediaPrivateKey.secretArn,
        AUTH_LIMIT_PARAMETER_PREFIX: '/flex-thia/prod/auth',
        ALLOWED_ORIGINS: props.allowedOrigins.join(','),
      },
    });
    props.cluster.grantDataApiAccess(this.apiFunction);
    props.clusterSecret.grantRead(this.apiFunction);
    props.challengeHmacPepper.grantRead(this.apiFunction);
    props.customAuthSecret.grantRead(this.apiFunction);
    props.mediaPrivateKey.grantRead(this.apiFunction);
    props.emailIdentity.grant(this.apiFunction, 'ses:SendEmail');
    props.inputBucket.grantReadWrite(this.apiFunction, 'inputs/*');
    props.mediaBucket.grantReadWrite(this.apiFunction);
    props.jobQueue.grantSendMessages(this.apiFunction);
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
        ],
        resources: [props.userPool.userPoolArn],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
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
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowHeaders: [
          'authorization',
          'content-type',
          'idempotency-key',
          'x-csrf-protection',
          'x-step-up-token',
        ],
        allowCredentials: true,
        maxAge: Duration.hours(1),
      },
    });
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });
    const domainName = new apigwv2.DomainName(this, 'DomainName', {
      domainName: props.domainName,
      certificate,
      endpointType: apigwv2.EndpointType.REGIONAL,
      securityPolicy: apigwv2.SecurityPolicy.TLS_1_2,
    });
    new apigwv2.ApiMapping(this, 'ApiMapping', {
      api: this.api,
      domainName,
    });
    new route53.ARecord(this, 'DomainAliasA', {
      zone: props.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId,
        ),
      ),
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
      [apigwv2.HttpMethod.POST, '/api/v1/auth/challenges'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/challenges/{challengeId}/code'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/challenges/{challengeId}/link'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/challenges/{challengeId}/resend'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/mfa/totp/challenge'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/refresh'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/logout'],
    ] as const) {
      this.api.addRoutes({ path, methods: [method], integration });
    }
    for (const [method, path] of [
      [apigwv2.HttpMethod.GET, '/api/v1/me'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/mfa/totp/setup'],
      [apigwv2.HttpMethod.POST, '/api/v1/auth/mfa/totp/setup/verify'],
      [apigwv2.HttpMethod.POST, '/api/v1/admin/content-imports'],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/content-imports'],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/content-imports/{importId}'],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/media-assets/audio-upload-requests',
      ],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/media-assets/{mediaAssetId}'],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/media-assets/{mediaAssetId}/complete',
      ],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/questions'],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/questions/{questionId}'],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/questions/{questionId}/versions',
      ],
      [apigwv2.HttpMethod.POST, '/api/v1/admin/questions/{questionId}/hide'],
      [apigwv2.HttpMethod.POST, '/api/v1/admin/questions/{questionId}/restore'],
      [apigwv2.HttpMethod.PUT, '/api/v1/admin/question-versions/{versionId}'],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/question-versions/{versionId}/validate',
      ],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/question-versions/{versionId}/publish',
      ],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/question-versions/{versionId}/invalidate',
      ],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/vocabularies'],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/vocabularies/{vocabularyId}'],
      [apigwv2.HttpMethod.PUT, '/api/v1/admin/vocabularies/{vocabularyId}'],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/vocabularies/{vocabularyId}/publish',
      ],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/vocabularies/{vocabularyId}/hide',
      ],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/admin/vocabularies/{vocabularyId}/restore',
      ],
      [apigwv2.HttpMethod.GET, '/api/v1/admin/users'],
      [apigwv2.HttpMethod.PATCH, '/api/v1/admin/users/{userId}/status'],
      [apigwv2.HttpMethod.POST, '/api/v1/admin/users/invitations'],
      [apigwv2.HttpMethod.GET, '/api/v1/me/wordbooks'],
      [apigwv2.HttpMethod.POST, '/api/v1/me/wordbooks'],
      [apigwv2.HttpMethod.PATCH, '/api/v1/me/wordbooks/{wordbookId}'],
      [apigwv2.HttpMethod.DELETE, '/api/v1/me/wordbooks/{wordbookId}'],
      [apigwv2.HttpMethod.GET, '/api/v1/me/wordbooks/{wordbookId}/items'],
      [
        apigwv2.HttpMethod.PUT,
        '/api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
      ],
      [
        apigwv2.HttpMethod.DELETE,
        '/api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
      ],
      [apigwv2.HttpMethod.POST, '/api/v1/me/wordbooks/{wordbookId}/items/copy'],
      [apigwv2.HttpMethod.POST, '/api/v1/me/wordbooks/{wordbookId}/items/move'],
      [
        apigwv2.HttpMethod.POST,
        '/api/v1/me/wordbooks/{wordbookId}/items/remove',
      ],
      [
        apigwv2.HttpMethod.GET,
        '/api/v1/me/vocabularies/{vocabularyId}/wordbook-memberships',
      ],
      [apigwv2.HttpMethod.GET, '/api/v1/me/question-attempts'],
      [apigwv2.HttpMethod.PUT, '/api/v1/me/saved-questions/{questionId}'],
      [apigwv2.HttpMethod.DELETE, '/api/v1/me/saved-questions/{questionId}'],
      [apigwv2.HttpMethod.GET, '/api/v1/questions'],
      [apigwv2.HttpMethod.GET, '/api/v1/questions/{questionId}'],
      [apigwv2.HttpMethod.POST, '/api/v1/questions/{questionId}/attempts'],
      [apigwv2.HttpMethod.GET, '/api/v1/vocabularies'],
      [apigwv2.HttpMethod.GET, '/api/v1/vocabularies/{vocabularyId}'],
      [apigwv2.HttpMethod.GET, '/api/v1/vocabularies/{vocabularyId}/questions'],
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

    new CfnOutput(this, 'ApiUrl', {
      value: `https://${props.domainName}`,
    });
  }
}
