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
    template.resourceCountIs('AWS::SecretsManager::Secret', 4);
  });
});
