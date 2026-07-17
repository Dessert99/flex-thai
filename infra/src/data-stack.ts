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

/** Aurora와 private input·media storage를 소유한다 */
export class DataStack extends Stack {
  /** Lambda가 Data API로 접근할 Aurora cluster */
  readonly cluster: rds.DatabaseCluster;
  /** Aurora generated credential secret */
  readonly clusterSecret: secretsmanager.ISecret;
  /** 30일 임시 원본 storage */
  readonly inputBucket: s3.Bucket;
  /** 게시 음성을 보존하는 storage */
  readonly mediaBucket: s3.Bucket;
  /** passwordless·step-up HMAC pepper secret */
  readonly challengeHmacPepper: secretsmanager.Secret;
  /** Cognito session AES-256 key secret */
  readonly challengeSessionKey: secretsmanager.Secret;
  /** CloudFront media private key를 배포 뒤 넣을 secret */
  readonly mediaPrivateKey: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      availabilityZones: ['ap-northeast-2a', 'ap-northeast-2c'],
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
      credentials: rds.Credentials.fromGeneratedSecret('flex_thia_admin'),
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
    this.clusterSecret = this.cluster.secret!;

    this.inputBucket = this.createPrivateBucket('InputBucket', [
      { expiration: Duration.days(30) },
    ]);
    this.mediaBucket = this.createPrivateBucket('MediaBucket');
    this.mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.mediaBucket.arnForObjects('*')],
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
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
        generateSecretString: {
          passwordLength: 64,
          excludePunctuation: true,
        },
      },
    );
    this.challengeSessionKey = new secretsmanager.Secret(
      this,
      'ChallengeSessionKey',
      {
        description: 'Cognito session AES-256 key 문자열',
        generateSecretString: {
          passwordLength: 32,
          excludePunctuation: true,
        },
      },
    );
    this.mediaPrivateKey = new secretsmanager.Secret(this, 'MediaPrivateKey', {
      description:
        'CloudFront signed media private key를 배포 뒤 수동 입력한다',
    });

    new CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
    });
    new CfnOutput(this, 'SecretArn', {
      value: this.clusterSecret.secretArn,
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
