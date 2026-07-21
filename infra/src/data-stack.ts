/** 장기 보존 데이터와 비용이 큰 DB를 애플리케이션 배포에서 분리한다 */
import {
  Aws,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

/** Aurora와 private input·media storage를 소유한다 — 앱 재배포가 데이터를 건드리지 못하게 Stack을 분리 */
export class DataStack extends Stack {
  /** Lambda가 VPC 밖에서 HTTPS(Data API)로 SQL을 보내는 Aurora cluster */
  readonly cluster: rds.DatabaseCluster;
  /** Aurora가 자동 생성한 DB 접속 정보 — 코드·env에 비밀번호를 두지 않으려고 secret으로 받는다 */
  readonly clusterSecret: secretsmanager.ISecret;
  /** 사용자가 올린 원본 음성 storage — 처리 뒤 보관 이유가 없어 30일 후 자동 삭제 */
  readonly inputBucket: s3.Bucket;
  /** 게시 음성을 보존하는 storage — CloudFront를 통해서만 읽힌다 */
  readonly mediaBucket: s3.Bucket;
  /** 인증 코드 해시에 섞는 서버 비밀값(pepper) — DB가 새도 코드 역산을 막는다 */
  readonly challengeHmacPepper: secretsmanager.Secret;
  /** CloudFront signed URL 서명용 private key — 배포 뒤 사람이 직접 채우는 빈 secret */
  readonly mediaPrivateKey: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Aurora는 VPC 안에서만 살 수 있어 DB 전용 격리 네트워크를 따로 만든다.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      // Aurora subnet group이 2개 AZ를 요구하고, 고정하지 않으면 lookup 결과가 바뀔 때 subnet이 교체된다.
      availabilityZones: ['ap-northeast-2a', 'ap-northeast-2c'],
      // 이 VPC에서 인터넷으로 나갈 자원이 없어 시간당 고정비인 NAT Gateway를 두지 않는다.
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'isolated',
          // 인터넷 경로가 아예 없는 subnet — DB를 외부에서 직접 열 수 없게
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.cluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_13,
      }),
      // 비밀번호를 코드·env에 두지 않고 Secrets Manager가 만들어 보관하게 맡긴다.
      credentials: rds.Credentials.fromGeneratedSecret('flex_thia_admin'),
      writer: rds.ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
      // 유휴 15분이면 0 ACU로 멈춰 쓰지 않는 시간의 DB 요금을 없앤다.
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: Duration.minutes(15),
      // VPC 밖 Lambda가 HTTPS로 SQL을 보내는 통로 — VPC 연결·NAT 없이 붙는 핵심 설정
      enableDataApi: true,
      defaultDatabaseName: 'flex_thia',
      backup: { retention: Duration.days(7) },
      // 실수로 DB가 지워지지 않게 막고, Stack이 지워져도 snapshot은 남긴다.
      deletionProtection: true,
      storageEncrypted: true,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });
    // fromGeneratedSecret을 썼으므로 secret은 항상 생성된다.
    this.clusterSecret = this.cluster.secret!;

    // 업로드 원본은 처리 뒤 쓸 일이 없어 30일 만료 규칙으로 보관 비용을 끊는다.
    this.inputBucket = this.createPrivateBucket('InputBucket', [
      { expiration: Duration.days(30) },
    ]);
    this.mediaBucket = this.createPrivateBucket('MediaBucket');
    // CloudFront에만 읽기를 허용 — EdgeStack에 이 policy를 두면 두 Stack이 서로를 참조해 순환한다.
    this.mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.mediaBucket.arnForObjects('*')],
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        // 우리 계정의 distribution으로 조건을 좁혀 남의 CloudFront가 이 bucket을 읽는 것을 막는다.
        conditions: {
          StringEquals: {
            'AWS:SourceAccount': Aws.ACCOUNT_ID,
          },
          StringLike: {
            'AWS:SourceArn': `arn:${Aws.PARTITION}:cloudfront::${Aws.ACCOUNT_ID}:distribution/*`,
          },
        },
      }),
    );
    this.challengeHmacPepper = new secretsmanager.Secret(
      this,
      'ChallengeHmacPepper',
      {
        description: 'Passwordless와 step-up HMAC pepper',
        // 특수문자를 빼 env·헤더로 옮길 때 escape 사고를 없앤다.
        generateSecretString: {
          passwordLength: 64,
          excludePunctuation: true,
        },
      },
    );
    // generateSecretString이 없으면 값 없는 빈 secret — private key는 CDK 밖에서 사람이 넣는다.
    this.mediaPrivateKey = new secretsmanager.Secret(this, 'MediaPrivateKey', {
      description:
        'CloudFront signed media private key를 배포 뒤 수동 입력한다',
    });

    // migration·운영 스크립트가 Data API를 호출하려면 이 ARN들을 알아야 한다.
    new CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
    });
    new CfnOutput(this, 'SecretArn', {
      value: this.clusterSecret.secretArn,
    });
    new CfnOutput(this, 'MediaPrivateKeySecretArn', {
      value: this.mediaPrivateKey.secretArn,
    });
  }

  /** 공개 접근·평문 전송·ACL을 모두 막은 bucket 기본값을 한곳에 모은다 */
  private createPrivateBucket(
    id: string,
    lifecycleRules: s3.LifecycleRule[] = [],
  ): s3.Bucket {
    return new s3.Bucket(this, id, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // 객체별 ACL을 아예 꺼서 접근 허용 경로를 bucket policy 하나로 좁힌다.
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules,
      // Stack을 지워도 bucket과 객체는 남긴다 — 배포 사고로 데이터가 사라지지 않게
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
  }
}
