/** DataStack이 public DB와 고정 NAT 비용을 만들지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { DataStack } from '../src/data-stack.js';

describe('DataStack', () => {
  it('Aurora Data API와 0-2 ACU auto-pause를 사용한다', () => {
    const template = Template.fromStack(new DataStack(new App(), 'TestData'));

    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EngineVersion: '16.13',
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

  it('업로드용 bucket을 만들지 않는다', () => {
    const template = Template.fromStack(new DataStack(new App(), 'TestData'));

    template.resourceCountIs('AWS::S3::Bucket', 0);
    template.resourceCountIs('AWS::SecretsManager::Secret', 2);
  });
});
