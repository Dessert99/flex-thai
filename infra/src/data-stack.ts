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
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export class DataStack extends Stack {
  /** Lambda가 VPC 밖에서 HTTPS(Data API)로 SQL을 보내는 Aurora cluster */
  readonly cluster: rds.DatabaseCluster;
  /** Aurora가 자동 생성한 DB 접속 정보 — 코드·env에 비밀번호를 두지 않으려고 secret으로 받는다 */
  readonly clusterSecret: secretsmanager.ISecret;

  /** 인증 코드 해시에 섞는 서버 비밀값(pepper) — DB가 새도 코드 역산을 막는다 */
  readonly challengeHmacPepper: secretsmanager.Secret;

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

    // migration·운영 스크립트가 Data API를 호출하려면 이 ARN들을 알아야 한다.
    new CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
    });
    new CfnOutput(this, 'SecretArn', {
      value: this.clusterSecret.secretArn,
    });
  }
}
