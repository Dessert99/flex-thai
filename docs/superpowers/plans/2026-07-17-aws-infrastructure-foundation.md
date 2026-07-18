# FLEX THIA AWS 인프라 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기초 백엔드의 API·인증 trigger·worker bundle을 AWS의 private storage, Aurora Data API, Cognito, SQS, Step Functions, API Gateway, CloudFront에 연결하는 재현 가능한 CDK 인프라를 만든다.

**Architecture:** `DataStack`은 오래 보존할 DB와 Input·Media S3를 서울 리전에 만들고, `ApplicationStack`은 Cognito·Lambda·API Gateway·SQS·Step Functions를 서울 리전에 만든다. `EdgeStack`은 Web S3·ACM·CloudFront·Route 53을 `us-east-1`과 글로벌 경계에 만들며, 모든 production 변경은 CDK와 수동 승인 GitHub Actions로만 수행한다.

**Tech Stack:** AWS CDK v2 `aws-cdk-lib@2.260.0`, CDK CLI `2.1130.0`, TypeScript 7.0.2 네이티브 컴파일러, TypeScript 6 compiler API 호환층, Node.js 22 Lambda runtime, Aurora PostgreSQL 16.3 Serverless v2, API Gateway HTTP API, Cognito, SES, SNS, S3, CloudFront, SQS, Step Functions, CloudWatch, AWS Budgets

**Prerequisite Plan:** [`2026-07-17-backend-foundation.md`](./2026-07-17-backend-foundation.md)의 Lambda bundle과 migration을 먼저 만든다.

**Source Spec:** [`2026-07-17-aws-serverless-infrastructure-design.md`](../specs/2026-07-17-aws-serverless-infrastructure-design.md)

## Global Constraints

- 기본 애플리케이션 리전은 `ap-northeast-2`, EdgeStack과 CloudFront용 ACM 인증서는 `us-east-1`이다.
- Lambda runtime은 `nodejs22.x`이고 API 예약 동시성은 `5`, timeout은 `29초`다.
- Aurora PostgreSQL은 `16.3`, Serverless v2 최소 `0` ACU, 최대 `2` ACU, 유휴 `15분` 뒤 auto-pause, 백업 `7일`이다.
- Aurora는 public access를 끄고 Data API만 사용하며 초기 NAT Gateway를 만들지 않는다.
- Input S3는 업로드 후 `30일`, SQS message는 `4일`, DLQ는 `14일`, API 로그는 `14일`, worker와 Step Functions 로그는 `30일` 보존한다.
- 모든 S3는 Public Access Block, ACL 비활성화, HTTPS-only, AWS 관리 저장 암호화를 사용한다.
- DataStack은 삭제 보호와 retain/snapshot 정책을 사용한다.
- production CORS는 정확한 Web origin과 명시한 localhost만 허용하고 wildcard credentials를 사용하지 않는다.
- AWS Budgets 초기 월 예산은 `30 USD`, 알림은 실제 `50%`, `80%`, `100%`와 예상 `100%`다.
- `Project=flex-thia`, `Environment=prod`, `ManagedBy=cdk` tag를 모든 CDK resource에 적용한다.
- WAF, Redis, OpenSearch, NAT Gateway, Fargate Service, ECR, 상시 staging은 만들지 않는다.
- 이번 계획의 Step Functions는 queue·중복 방지·상태 전이를 검증하는 foundation task까지만 포함하고 실제 OCR·AI 생성·독립 검증·TTS 단계는 후속 콘텐츠 구현 계획에서 확장한다.
- 실제 production 배포는 AWS 계정·도메인·SES·SNS 준비를 확인한 뒤 수동으로만 실행한다.
- 브라우저·API 통합 E2E 테스트를 만들지 않고 CDK assertion과 `cdk synth`로 검증한다.

---

## 파일 구조

```text
infra/
├─ package.json
├─ tsconfig.json
├─ cdk.json
├─ src/
│  ├─ app.ts
│  ├─ config.ts
│  ├─ data-stack.ts
│  ├─ application-stack.ts
│  ├─ edge-stack.ts
│  ├─ constructs/
│  │  ├─ identity.ts
│  │  ├─ async-jobs.ts
│  │  ├─ http-api.ts
│  │  └─ observability.ts
│  └─ tags.ts
├─ test/
│  ├─ config.spec.ts
│  ├─ data-stack.spec.ts
│  ├─ application-stack.spec.ts
│  └─ edge-stack.spec.ts
└─ assets/web/index.html

.github/workflows/
├─ check.yml
└─ deploy-production.yml

docs/development/
├─ aws-account-setup.md
└─ aws-deployment.md
```

## Task 1: CDK 애플리케이션과 배포 설정

**학습 포인트:** CDK code, CloudFormation template, Stack, region, synth와 deploy의 차이

**Files:**
- Create: `infra/package.json`
- Create: `infra/tsconfig.json`
- Create: `infra/cdk.json`
- Create: `infra/src/config.ts`
- Create: `infra/src/app.ts`
- Create: `infra/src/tags.ts`
- Test: `infra/test/config.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `readInfrastructureConfig(context): InfrastructureConfig`
- Produces: CDK app stacks `FlexThiaDataProd`, `FlexThiaApplicationProd`, `FlexThiaEdgeProd`
- Produces: root scripts `infra:test`, `infra:synth`

- [ ] **Step 1: 누락 설정의 실패 테스트를 작성한다**

```ts
/** 잘못된 domain과 알림 email이 CloudFormation까지 새지 않게 검증한다 */
import { describe, expect, it } from 'vitest';
import { readInfrastructureConfig } from '../src/config.js';

describe('readInfrastructureConfig', () => {
  it('필수 production 설정이 빠지면 synth 전에 실패한다', () => {
    expect(() => readInfrastructureConfig({})).toThrow();
  });

  it('서울 애플리케이션과 버지니아 edge 리전을 고정한다', () => {
    const config = readInfrastructureConfig({
      account: '123456789012',
      rootDomain: 'example.com',
      hostedZoneId: 'Z0123456789EXAMPLE',
      alertEmail: 'owner@example.com',
      githubRepository: 'Dessert99/flex-thai',
      mediaPublicKeyPem: 'test-public-key',
    });

    expect(config.appRegion).toBe('ap-northeast-2');
    expect(config.edgeRegion).toBe('us-east-1');
  });
});
```

- [ ] **Step 2: Zod 기반 CDK context 설정을 구현한다**

```ts
/** CDK synth와 deploy가 같은 production 설정을 사용하게 검증한다 */
import { z } from 'zod';

const infrastructureConfigSchema = z.object({
  account: z.string().regex(/^\d{12}$/),
  rootDomain: z.string().min(3),
  hostedZoneId: z.string().min(2),
  alertEmail: z.email(),
  githubRepository: z.string().regex(/^[^/]+\/[^/]+$/),
  mediaPublicKeyPem: z.string().min(1),
  appRegion: z.literal('ap-northeast-2').default('ap-northeast-2'),
  edgeRegion: z.literal('us-east-1').default('us-east-1'),
  monthlyBudgetUsd: z.coerce.number().positive().default(30),
});

/** CDK Stack이 공유하는 검증된 production 설정 */
export type InfrastructureConfig = z.infer<typeof infrastructureConfigSchema>;

/** CDK context 문자열을 안전한 설정으로 변환한다 */
export const readInfrastructureConfig = (
  context: Record<string, unknown>,
): InfrastructureConfig => infrastructureConfigSchema.parse(context);
```

- [ ] **Step 3: CDK package와 app entrypoint를 구현한다**

`infra/package.json`:

```json
{
  "name": "@flex-thia/infra",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run test",
    "synth": "cdk synth --all -c synthFixture=true"
  },
  "dependencies": {
    "aws-cdk-lib": "2.260.0",
    "constructs": "^10.5.0",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "aws-cdk": "2.1130.0",
    "esbuild": "^0.25.0"
  }
}
```

`src/app.ts`는 `synthFixture=true`일 때만 테스트 전용 account
`123456789012`, domain `example.com`, hosted zone
`Z0123456789EXAMPLE`, alert email `owner@example.com`, 검증용 public key를
사용한다. 이 context가 없으면 `account`, `rootDomain`, `hostedZoneId`,
`alertEmail`, `githubRepository`, `mediaPublicKeyPem`을 각각 CDK context에서
읽어 `readInfrastructureConfig`에 넘긴다. 세 Stack에는 명시적인
`{ account, region }`을 주고 `DataStack → ApplicationStack`과
`DataStack·ApplicationStack → EdgeStack` 의존성을 선언한다. cross-region
참조가 있는 Stack에는 `crossRegionReferences: true`를 적용한다.

- [ ] **Step 4: 공통 tag helper를 구현한다**

```ts
/** 비용 탐색과 drift 구분을 위해 모든 resource에 동일 tag를 붙인다 */
import { Tags } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

/** FLEX THIA production 공통 tag를 construct tree에 적용한다 */
export const applyProjectTags = (scope: IConstruct): void => {
  Tags.of(scope).add('Project', 'flex-thia');
  Tags.of(scope).add('Environment', 'prod');
  Tags.of(scope).add('ManagedBy', 'cdk');
};
```

- [ ] **Step 5: 설정 테스트와 빈 Stack synth를 실행한다**

Run:

```bash
pnpm --filter @flex-thia/infra test
pnpm --filter @flex-thia/infra typecheck
```

Expected: config tests PASS, typecheck exit 0

- [ ] **Step 6: 커밋한다**

```bash
git add package.json pnpm-lock.yaml infra
git commit -m "chore: bootstrap aws cdk application"
```

## Task 2: DataStack의 Aurora와 private S3

**학습 포인트:** VPC, subnet, DB cluster, Data API, S3 bucket과 lifecycle

**Files:**
- Create: `infra/src/data-stack.ts`
- Test: `infra/test/data-stack.spec.ts`

**Interfaces:**
- Produces: `DataStack.cluster`, `clusterSecret`, `inputBucket`, `mediaBucket`
- Consumes: `InfrastructureConfig`

- [ ] **Step 1: 비용·보안 기본값의 실패 테스트를 작성한다**

```ts
/** DataStack이 public DB와 고정 NAT 비용을 만들지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { DataStack } from '../src/data-stack.js';

describe('DataStack', () => {
  it('Aurora Data API와 0-2 ACU auto-pause를 사용한다', () => {
    const template = Template.fromStack(new DataStack(new App(), 'TestData'));

    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EnableHttpEndpoint: true,
      DeletionProtection: true,
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0,
        MaxCapacity: 2,
        SecondsUntilAutoPause: 900,
      },
    });
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  it('Input bucket은 public을 차단하고 30일 뒤 만료한다', () => {
    const template = Template.fromStack(new DataStack(new App(), 'TestData'));

    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ ExpirationInDays: 30, Status: 'Enabled' }),
        ]),
      },
    });
  });
});
```

- [ ] **Step 2: NAT 없는 isolated VPC와 Aurora를 구현한다**

```ts
/** 장기 보존 데이터와 비용이 큰 DB를 애플리케이션 배포에서 분리한다 */
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/** Aurora와 private input·media storage를 소유한다 */
export class DataStack extends Stack {
  /** Lambda가 Data API로 접근할 Aurora cluster */
  readonly cluster: rds.DatabaseCluster;
  /** 30일 임시 원본 storage */
  readonly inputBucket: s3.Bucket;
  /** 게시 음성을 보존하는 storage */
  readonly mediaBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.cluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_3,
      }),
      writer: rds.ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: Duration.minutes(15),
      enableDataApi: true,
      defaultDatabaseName: 'flex_thia',
      backup: { retention: Duration.days(7) },
      deletionProtection: true,
      storageEncrypted: true,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });

    this.inputBucket = this.createPrivateBucket('InputBucket', [
      { expiration: Duration.days(30) },
    ]);
    this.mediaBucket = this.createPrivateBucket('MediaBucket');

    new CfnOutput(this, 'ClusterArn', { value: this.cluster.clusterArn });
    new CfnOutput(this, 'SecretArn', {
      value: this.cluster.secret!.secretArn,
    });
  }

  private createPrivateBucket(
    id: string,
    lifecycleRules: s3.LifecycleRule[] = [],
  ): s3.Bucket {
    return new s3.Bucket(this, id, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
  }
}
```

- [ ] **Step 3: challenge와 media 서명 secret container를 추가한다**

Secrets Manager에는 `otp-hmac-pepper`, `challenge-session-key`,
`cloudfront-media-private-key`라는 목적별 secret을 만든다. CloudFormation
template에 실제 값은 넣지 않고 generated secret 또는 배포 뒤 수동 입력할
빈 secret container만 만든다.

- [ ] **Step 4: assertion과 synth를 실행한다**

Run:

```bash
pnpm --filter @flex-thia/infra test -- data-stack.spec.ts
pnpm --filter @flex-thia/infra synth
```

Expected: Aurora, S3, NAT 0 assertion PASS; DataStack template synth

- [ ] **Step 5: 커밋한다**

```bash
git add infra/src/data-stack.ts infra/test/data-stack.spec.ts
git commit -m "feat: add persistent aws data stack"
```

## Task 3: Cognito custom auth, SES, SNS 권한

**학습 포인트:** User Pool, App Client, Lambda trigger, 이메일 발신 identity, SMS 권한

**Files:**
- Create: `infra/src/constructs/identity.ts`
- Test: `infra/test/identity.spec.ts`
- Modify: `infra/src/application-stack.ts`

**Interfaces:**
- Produces: `Identity.userPool`, `userPoolClient`, `issuerUrl`
- Consumes: auth trigger bundles, DataStack cluster와 secret, root domain

- [ ] **Step 1: password를 허용하지 않는 App Client 테스트를 작성한다**

```ts
/** 학교 이메일 custom auth만 열고 비밀번호 flow가 돌아오지 않게 고정한다 */
template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
  ExplicitAuthFlows: Match.arrayWith(['ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
  PreventUserExistenceErrors: 'ENABLED',
  EnableTokenRevocation: true,
  RefreshTokenRotation: Match.objectLike({
    Feature: 'ENABLED',
    RetryGracePeriodSeconds: 10,
  }),
});
template.hasResourceProperties('AWS::Cognito::UserPool', {
  AdminCreateUserConfig: {
    AllowAdminCreateUserOnly: true,
  },
  LambdaConfig: Match.objectLike({
    DefineAuthChallenge: Match.anyValue(),
    CreateAuthChallenge: Match.anyValue(),
    VerifyAuthChallengeResponse: Match.anyValue(),
  }),
});
```

- [ ] **Step 2: Identity construct를 구현한다**

```ts
/** 학교 이메일 passwordless와 관리자 SMS의 AWS 자원을 묶는다 */
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

/** custom auth에 필요한 Lambda bundle 경로 */
export interface IdentityProps {
  defineChallengeEntry: string;
  createChallengeEntry: string;
  verifyChallengeEntry: string;
}

/** Cognito User Pool과 세 custom challenge trigger */
export class Identity extends Construct {
  /** API Gateway JWT issuer가 참조하는 User Pool */
  readonly userPool: cognito.UserPool;
  /** custom auth와 refresh token을 허용하는 App Client */
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      signInAliases: { email: true },
      selfSignUpEnabled: false,
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const trigger = (name: string, entry: string) =>
      new nodejs.NodejsFunction(this, name, {
        entry,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: Duration.seconds(10),
        memorySize: 256,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      });

    this.userPool.addTrigger(
      cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE,
      trigger('DefineChallenge', props.defineChallengeEntry),
    );
    this.userPool.addTrigger(
      cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE,
      trigger('CreateChallenge', props.createChallengeEntry),
    );
    this.userPool.addTrigger(
      cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE,
      trigger('VerifyChallenge', props.verifyChallengeEntry),
    );

    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: { custom: true },
      accessTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      refreshTokenRotationGracePeriod: Duration.seconds(10),
    });
  }
}
```

App Client secret은 생성하지 않는다. 신규 사용자는 학교 domain을 검증한
API Lambda만 `AdminCreateUser`로 만들 수 있고, custom challenge와 token
교환도 API Lambda가 담당한다. client ID만 브라우저에 노출될 수 있다.

- [ ] **Step 3: SES domain identity와 최소 권한을 연결한다**

서울 리전 ApplicationStack에서 Route 53 hosted zone을 ID로 import하고
`ses.EmailIdentity` domain identity를 만든다. Create Challenge Lambda에는
해당 identity의 `ses:SendEmail`만, Data API cluster와 challenge secret
read만 허용한다. API Lambda에는 특정 전화번호로 SNS Publish를 수행할
정책을 주되 로그에는 전체 번호를 남기지 않는다.

- [ ] **Step 4: identity assertion과 typecheck를 실행한다**

Run:

```bash
pnpm --filter @flex-thia/infra test -- identity.spec.ts
pnpm --filter @flex-thia/infra typecheck
```

Expected: custom auth, refresh rotation, 세 trigger, 최소 권한 assertion PASS

- [ ] **Step 5: 커밋한다**

```bash
git add infra/src/constructs/identity.ts infra/src/application-stack.ts infra/test/identity.spec.ts
git commit -m "feat: add cognito passwordless infrastructure"
```

## Task 4: SQS, DLQ, Step Functions 기초 workflow

**학습 포인트:** queue, at-least-once, DLQ, event source mapping, state machine

**Files:**
- Create: `infra/src/constructs/async-jobs.ts`
- Test: `infra/test/async-jobs.spec.ts`
- Modify: `infra/src/application-stack.ts`

**Interfaces:**
- Produces: `AsyncJobs.queue`, `deadLetterQueue`, `stateMachine`
- Consumes: `apps/worker/dist/job-starter.js`, `foundation-task.js`

- [ ] **Step 1: 보존·재시도·동시성 assertion을 작성한다**

```ts
/** queue 폭주와 poison message가 무제한 반복되지 않게 고정한다 */
template.hasResourceProperties('AWS::SQS::Queue', {
  MessageRetentionPeriod: 345600,
  ReceiveMessageWaitTimeSeconds: 20,
  RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
});
template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
  BatchSize: 1,
});
template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
  StateMachineType: 'STANDARD',
});
```

- [ ] **Step 2: Queue와 Lambda event source를 구현한다**

```ts
/** API가 접수한 Job을 추적 가능한 Standard Workflow로 넘긴다 */
import { Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { Construct } from 'constructs';

/** 기초 worker bundle을 queue와 workflow에 연결한다 */
export class AsyncJobs extends Construct {
  /** API가 jobId를 보내는 Standard Queue */
  readonly queue: sqs.Queue;
  /** 실행 이력을 보존하는 Standard Workflow */
  readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: AsyncJobsProps) {
    super(scope, id);
    const deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    this.queue = new sqs.Queue(this, 'JobQueue', {
      retentionPeriod: Duration.days(4),
      receiveMessageWaitTime: Duration.seconds(20),
      visibilityTimeout: Duration.seconds(60),
      enforceSSL: true,
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
    });

    const foundationTask = props.createWorker('FoundationTask', props.foundationEntry);
    const definition = new tasks.LambdaInvoke(this, 'RunFoundationTask', {
      lambdaFunction: foundationTask,
      payloadResponseOnly: true,
    });
    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      logs: {
        destination: new logs.LogGroup(this, 'WorkflowLogs', {
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });

    const starter = props.createWorker('JobStarter', props.jobStarterEntry);
    starter.addEventSource(
      new eventSources.SqsEventSource(this.queue, { batchSize: 1 }),
    );
    this.stateMachine.grantStartExecution(starter);
  }
}
```

- [ ] **Step 3: worker IAM과 환경 변수를 최소화한다**

Job Starter는 특정 state machine의 `states:StartExecution`만 가진다.
Foundation Task는 특정 Aurora cluster Data API와 secret read만 가진다.
두 Lambda 모두 reserved concurrency `2`, timeout `60초`, 로그 `30일`이며
Provider API key와 S3 write 권한은 받지 않는다.

- [ ] **Step 4: workflow assertion과 synth를 실행한다**

Run:

```bash
pnpm --filter @flex-thia/worker build:lambda
pnpm --filter @flex-thia/infra test -- async-jobs.spec.ts
pnpm --filter @flex-thia/infra synth
```

Expected: SQS, DLQ, event source, Standard Workflow assertion PASS

- [ ] **Step 5: 커밋한다**

```bash
git add infra/src/constructs/async-jobs.ts infra/src/application-stack.ts infra/test/async-jobs.spec.ts
git commit -m "feat: add asynchronous job infrastructure"
```

## Task 5: API Lambda와 API Gateway HTTP API

**학습 포인트:** Lambda integration, route, JWT authorizer, CORS, throttling

**Files:**
- Create: `infra/src/constructs/http-api.ts`
- Test: `infra/test/http-api.spec.ts`
- Modify: `infra/src/application-stack.ts`

**Interfaces:**
- Produces: `HttpApi.api`, `apiUrl`, API Lambda
- Consumes: API bundle, Cognito issuer와 client ID, DataStack, Job queue, Input S3

- [ ] **Step 1: public·protected route와 Lambda 제한 테스트를 작성한다**

```ts
/** 공개 인증 route 외의 Job API가 JWT 없이 열리지 않게 고정한다 */
template.hasResourceProperties('AWS::Lambda::Function', {
  Runtime: 'nodejs22.x',
  Timeout: 29,
  ReservedConcurrentExecutions: 5,
});
template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
  AuthorizerType: 'JWT',
  IdentitySource: ['$request.header.Authorization'],
});
template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
  RouteKey: 'POST /jobs',
  AuthorizationType: 'JWT',
});
template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
  RouteKey: 'GET /health',
  AuthorizationType: 'NONE',
});
```

- [ ] **Step 2: API Lambda를 구현한다**

Lambda는 `apps/api/dist/lambda.js` asset을 사용하고 Node.js 22, 1024MB,
29초, reserved concurrency 5, logs 14일로 만든다. 환경 변수에는
`DATABASE_MODE=data-api`, cluster ARN, DB secret ARN, Cognito pool/client,
Input bucket, Job queue URL, exact allowed origin만 넣는다. secret 원문은
환경 변수에 넣지 않는다.

권한:

- cluster Data API execute
- DB secret read
- Input bucket의 `inputs/*` POST·HeadObject
- Job queue SendMessage
- Cognito InitiateAuth·RespondToAuthChallenge·RevokeToken
- Cognito AdminGetUser·AdminCreateUser
- SNS Publish

- [ ] **Step 3: HTTP API와 route별 authorizer를 구현한다**

```ts
/** 공개 인증과 보호된 애플리케이션 route를 API Gateway에서 먼저 분리한다 */
const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
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
  props.apiFunction,
);
const authorizer = new authorizers.HttpJwtAuthorizer(
  'CognitoAuthorizer',
  props.issuerUrl,
  { jwtAudience: [props.userPoolClientId] },
);

httpApi.addRoutes({
  path: '/health',
  methods: [apigwv2.HttpMethod.GET],
  integration,
});
httpApi.addRoutes({
  path: '/jobs',
  methods: [apigwv2.HttpMethod.POST],
  integration,
  authorizer,
});
httpApi.addRoutes({
  path: '/jobs/{jobId}',
  methods: [apigwv2.HttpMethod.GET],
  integration,
  authorizer,
});
```

공개 route에는 `/ready`, `/auth/challenges`,
`/auth/challenges/{id}/code`, `/auth/challenges/{id}/link`,
`/auth/refresh`, `/auth/logout`을 명시한다. catch-all public route는 만들지
않는다.

- [ ] **Step 4: access log와 throttling을 구현한다**

Stage access log에는 request ID, route, status, latency만 넣는다. body,
Authorization, cookie는 기록하지 않는다. default throttle은 burst `10`,
rate `5 req/s`로 시작하고 인증 challenge route는 더 낮은 애플리케이션
rate limit도 적용한다.

- [ ] **Step 5: API assertion과 synth를 실행한다**

Run:

```bash
pnpm --filter @flex-thia/api build:lambda
pnpm --filter @flex-thia/infra test -- http-api.spec.ts
pnpm --filter @flex-thia/infra synth
```

Expected: runtime, concurrency, authorizer, public/protected route, CORS assertion PASS

- [ ] **Step 6: 커밋한다**

```bash
git add infra/src/constructs/http-api.ts infra/src/application-stack.ts infra/test/http-api.spec.ts
git commit -m "feat: add serverless http api infrastructure"
```

## Task 6: EdgeStack의 Web S3, CloudFront, ACM, Route 53

**학습 포인트:** origin, CDN, TLS 인증서, DNS, OAC와 public S3의 차이

**Files:**
- Create: `infra/src/edge-stack.ts`
- Create: `infra/assets/web/index.html`
- Test: `infra/test/edge-stack.spec.ts`

**Interfaces:**
- Produces: `https://app.<rootDomain>`
- Produces: CloudFront `/media/*` behavior with trusted key group
- Consumes: Media S3, hosted zone, media public key

- [ ] **Step 1: S3 public 차단과 HTTPS redirect 테스트를 작성한다**

```ts
/** 정적 파일과 media가 S3 URL로 직접 공개되지 않게 고정한다 */
template.hasResourceProperties('AWS::S3::Bucket', {
  PublicAccessBlockConfiguration: {
    BlockPublicAcls: true,
    BlockPublicPolicy: true,
    IgnorePublicAcls: true,
    RestrictPublicBuckets: true,
  },
});
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: Match.objectLike({
    ViewerCertificate: Match.anyValue(),
    DefaultCacheBehavior: Match.objectLike({
      ViewerProtocolPolicy: 'redirect-to-https',
    }),
  }),
});
```

- [ ] **Step 2: Web bucket과 CloudFront OAC를 구현한다**

`EdgeStack`은 `us-east-1`에 Web bucket을 만들고
`S3BucketOrigin.withOriginAccessControl`로 default behavior를 연결한다.
해시 asset은 장기 cache, `index.html`은 짧은 cache를 사용한다. 403·404는
`/index.html`과 200으로 응답해 SPA route를 지원한다.

`infra/assets/web/index.html`은 다음 배포 probe만 담는다.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FLEX THIA</title>
  </head>
  <body>
    <main>
      <h1>FLEX THIA infrastructure ready</h1>
      <p>이 파일은 Vite 프론트엔드 배포 전 CloudFront 경로를 확인한다.</p>
    </main>
  </body>
</html>
```

- [ ] **Step 3: ACM과 DNS를 구현한다**

Hosted zone은 `HostedZone.fromHostedZoneAttributes`로 import해 synth 시 AWS
lookup을 하지 않는다. `app.<rootDomain>` 인증서를 DNS validation으로
만들고 CloudFront alias와 Route 53 A/AAAA alias record를 연결한다.

- [ ] **Step 4: private media behavior를 구현한다**

Media bucket도 OAC origin으로 연결하고 `/media/*` behavior에
`trustedKeyGroups`를 설정한다. CDK context의 public key만 CloudFront
PublicKey resource에 들어가고 private key는 template과 Git에 포함하지
않는다. private key는 DataStack의 Secrets Manager secret에 배포 뒤
입력한다.

- [ ] **Step 5: Edge assertion과 synth를 실행한다**

Run:

```bash
pnpm --filter @flex-thia/infra test -- edge-stack.spec.ts
pnpm --filter @flex-thia/infra synth
```

Expected: S3 public block, OAC, HTTPS, ACM, alias, trusted key group assertion PASS

- [ ] **Step 6: 커밋한다**

```bash
git add infra/src/edge-stack.ts infra/assets/web/index.html infra/test/edge-stack.spec.ts
git commit -m "feat: add private cloudfront edge stack"
```

## Task 7: CloudWatch, Parameter Store, AWS Budgets

**학습 포인트:** log와 metric, alarm, 비용 알림, secret과 일반 설정의 차이

**Files:**
- Create: `infra/src/constructs/observability.ts`
- Test: `infra/test/observability.spec.ts`
- Modify: `infra/src/application-stack.ts`

**Interfaces:**
- Produces: alarm SNS topic, API·worker·queue·workflow·Aurora alarms
- Produces: SSM parameters
- Produces: 30 USD monthly budget notifications

- [ ] **Step 1: Budget과 DLQ alarm 테스트를 작성한다**

```ts
/** 비용과 poison message를 운영자가 놓치지 않게 고정한다 */
template.hasResourceProperties('AWS::Budgets::Budget', {
  Budget: {
    BudgetLimit: { Amount: 30, Unit: 'USD' },
    BudgetType: 'COST',
    TimeUnit: 'MONTHLY',
  },
});
template.hasResourceProperties('AWS::CloudWatch::Alarm', {
  MetricName: 'ApproximateNumberOfMessagesVisible',
  Threshold: 0,
  ComparisonOperator: 'GreaterThanThreshold',
});
```

- [ ] **Step 2: 운영 알람 topic과 metric alarm을 구현한다**

알람 topic은 운영자 이메일 subscription을 사용한다. 다음 alarm을 만든다.

- API Gateway 5xx
- API Lambda errors, throttles, duration
- Job Starter와 worker errors, throttles
- SQS oldest message age
- DLQ visible messages `> 0`
- Step Functions failed executions
- Aurora ACU 최대치 지속 도달
- SES bounce·complaint와 SNS SMS delivery failure용 metric

- [ ] **Step 3: Parameter Store와 Budget을 구현한다**

Parameter 이름은 `/flex-thia/prod/` prefix를 사용한다.

```text
/flex-thia/prod/auth/allowed-email-domains
/flex-thia/prod/auth/challenge-ttl-seconds = 600
/flex-thia/prod/auth/step-up-ttl-seconds = 300
/flex-thia/prod/jobs/map-max-concurrency = 2
/flex-thia/prod/jobs/provider-max-concurrency = 1
/flex-thia/prod/uploads/max-file-bytes = 26214400
/flex-thia/prod/uploads/max-job-bytes = 262144000
```

AWS Budget notification은 실제 50·80·100%, 예상 100%를 운영자 이메일로
보낸다. Budget은 자원을 자동 종료하지 않는다.

- [ ] **Step 4: observability assertion과 전체 synth를 실행한다**

Run:

```bash
pnpm --filter @flex-thia/infra test -- observability.spec.ts
pnpm --filter @flex-thia/infra synth
```

Expected: Budget, alarm topic, 핵심 alarm, SSM parameter assertion PASS

- [ ] **Step 5: 커밋한다**

```bash
git add infra/src/constructs/observability.ts infra/src/application-stack.ts infra/test/observability.spec.ts
git commit -m "feat: add aws observability and budget guards"
```

## Task 8: GitHub Actions OIDC와 AWS 입문 배포 문서

**학습 포인트:** 장기 access key 없이 배포하는 이유, bootstrap, diff, deploy, migration 순서

**Files:**
- Create: `.github/workflows/check.yml`
- Create: `.github/workflows/deploy-production.yml`
- Create: `docs/development/aws-account-setup.md`
- Create: `docs/development/aws-deployment.md`
- Modify: `package.json`

**Interfaces:**
- Produces: PR 검증 workflow
- Produces: `workflow_dispatch` production deploy workflow
- Produces: AWS 계정 준비와 배포 runbook

- [x] **Step 1: 저장소 검증 workflow를 작성한다**

```yaml
name: check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6.0.2
      - uses: pnpm/action-setup@v6.0.8
        with:
          version: 10.33.0
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm --filter @flex-thia/infra synth
```

- [x] **Step 2: OIDC production 배포 workflow를 작성한다**

```yaml
name: deploy-production

on:
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    environment: production
    runs-on: ubuntu-latest
    env:
      CDK_ACCOUNT: ${{ vars.AWS_ACCOUNT_ID }}
      ROOT_DOMAIN: ${{ vars.ROOT_DOMAIN }}
      HOSTED_ZONE_ID: ${{ vars.HOSTED_ZONE_ID }}
      ALERT_EMAIL: ${{ vars.ALERT_EMAIL }}
      MEDIA_PUBLIC_KEY_PEM: ${{ vars.MEDIA_PUBLIC_KEY_PEM }}
    steps:
      - uses: actions/checkout@v6.0.2
      - uses: pnpm/action-setup@v6.0.8
        with:
          version: 10.33.0
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: 22
          cache: pnpm
      - uses: aws-actions/configure-aws-credentials@v6.2.2
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ap-northeast-2
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: >
          pnpm --filter @flex-thia/infra exec cdk diff --all
          -c account="$CDK_ACCOUNT"
          -c rootDomain="$ROOT_DOMAIN"
          -c hostedZoneId="$HOSTED_ZONE_ID"
          -c alertEmail="$ALERT_EMAIL"
          -c githubRepository="Dessert99/flex-thai"
          -c mediaPublicKeyPem="$MEDIA_PUBLIC_KEY_PEM"
      - run: >
          pnpm --filter @flex-thia/infra exec cdk deploy FlexThiaDataProd
          --require-approval never
          -c account="$CDK_ACCOUNT"
          -c rootDomain="$ROOT_DOMAIN"
          -c hostedZoneId="$HOSTED_ZONE_ID"
          -c alertEmail="$ALERT_EMAIL"
          -c githubRepository="Dessert99/flex-thai"
          -c mediaPublicKeyPem="$MEDIA_PUBLIC_KEY_PEM"
          --outputs-file cdk-outputs.json
      - run: |
          echo "RDS_RESOURCE_ARN=$(jq -r '.FlexThiaDataProd.ClusterArn' cdk-outputs.json)" >> "$GITHUB_ENV"
          echo "RDS_SECRET_ARN=$(jq -r '.FlexThiaDataProd.SecretArn' cdk-outputs.json)" >> "$GITHUB_ENV"
          echo "DATABASE_NAME=flex_thia" >> "$GITHUB_ENV"
          echo "AWS_REGION=ap-northeast-2" >> "$GITHUB_ENV"
      - run: pnpm --filter @flex-thia/database db:migrate:data-api
      - run: >
          pnpm --filter @flex-thia/infra exec cdk deploy
          FlexThiaApplicationProd FlexThiaEdgeProd
          --require-approval never
          -c account="$CDK_ACCOUNT"
          -c rootDomain="$ROOT_DOMAIN"
          -c hostedZoneId="$HOSTED_ZONE_ID"
          -c alertEmail="$ALERT_EMAIL"
          -c githubRepository="Dessert99/flex-thai"
          -c mediaPublicKeyPem="$MEDIA_PUBLIC_KEY_PEM"
```

GitHub `production` environment의 required reviewer가 실제 수동 승인 경계다.
OIDC role trust policy는 GitHub Environment와 `aud=sts.amazonaws.com`을
함께 제한한다. 저장소가 immutable subject를 사용한다면 owner·repository ID가
포함된 실제 subject를 확인해 정확히 등록한다. 실제 입력값 검사, 계정 준비,
복구 절차는 `docs/development/aws-account-setup.md`와
`docs/development/aws-deployment.md`가 최신 구현 기준이다.

- [x] **Step 3: AWS 계정 준비 문서를 초보자 관점으로 작성한다**

다음 순서와 이유를 포함한다.

1. AWS root MFA 설정, root 일상 사용 금지
2. IAM Identity Center 또는 임시 자격 증명으로 사람 로그인
3. AWS CLI 설치 후 `aws sts get-caller-identity`
4. Route 53 hosted zone과 root domain 확인
5. SES domain identity DKIM 검증과 production access 요청
6. SNS 한국 SMS sandbox·발신 등록 확인
7. `us-east-1`, `ap-northeast-2` 각각 `cdk bootstrap`
8. GitHub OIDC deploy role과 production environment 생성
9. `cdk diff`에서 replacement와 deletion 읽는 법

AWS CLI는 현재 로컬에 없으므로 synth 완료 조건에는 포함하지 않고 실제
deploy 전에 설치·로그인한다.

- [x] **Step 4: 배포·복구 runbook을 작성한다**

배포 순서는 backend Lambda build → 전체 test → CDK synth → migration
검토 → DataStack → ApplicationStack → EdgeStack이다. Aurora migration은
애플리케이션 시작 시 자동 실행하지 않는다. 실패 시 Lambda 이전 artifact
재배포, destructive migration 중지, CloudFormation rollback 확인 절차를
문서화한다.

- [x] **Step 5: 전체 검증을 fresh run한다**

Run:

```bash
pnpm format
pnpm check
pnpm --filter @flex-thia/infra synth
git diff --check
```

Expected: format, lint, typecheck, unit tests, CDK assertion, Lambda build,
CDK synth 모두 exit 0; whitespace error 0

- [x] **Step 6: 최종 커밋한다**

```bash
git add .github package.json docs/development infra
git commit -m "docs: add aws deployment runbooks"
```

## 실제 배포 전 수동 체크포인트

코드 구현 완료와 AWS production 배포는 분리한다. 아래 조건이 모두 확인되기
전에는 `cdk deploy`를 실행하지 않는다.

- AWS account ID와 결제 알림 수신 이메일 확인
- root MFA와 일상용 임시 자격 증명 확인
- root domain과 Route 53 hosted zone ID 확인
- SES domain identity와 DKIM 준비
- SNS 한국 SMS 운영 조건 확인
- CloudFront media public/private key pair 준비
- GitHub production environment reviewer 설정
- `cdk diff`에서 DataStack replacement와 deletion 없음 확인
- 월 30 USD Budget subscriber 이메일 확인

## 완료 기준

- `pnpm check`와 `pnpm --filter @flex-thia/infra synth`가 통과한다.
- DataStack에는 public DB, NAT Gateway, public S3가 없다.
- Aurora는 Data API, 0-2 ACU, 15분 auto-pause, 7일 backup, deletion protection을 사용한다.
- Cognito custom auth 세 trigger와 refresh rotation이 template에 존재한다.
- Job queue는 4일, DLQ는 14일, maxReceiveCount는 5다.
- API Lambda는 Node.js 22, 29초, reserved concurrency 5다.
- `/jobs` route는 JWT authorizer를 요구하고 `/health`만 명시적으로 public이다.
- CloudFront는 private Web·Media S3를 OAC로 읽고 HTTPS만 허용한다.
- private media behavior는 trusted key group을 요구한다.
- 핵심 alarm과 월 30 USD Budget 알림이 template에 존재한다.
- production workflow는 OIDC와 GitHub environment 수동 승인을 사용한다.
- 실제 AWS 배포 전 체크포인트가 문서화되어 있고 자동 production deploy가 없다.
