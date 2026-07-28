/** DataStack이 public DB와 고정 NAT 비용을 만들지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
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
    template.resourceCountIs('AWS::SecretsManager::Secret', 3);
  });

  it('Media bucket은 같은 계정의 CloudFront OAC만 읽을 수 있다', () => {
    const template = Template.fromStack(new DataStack(new App(), 'TestData'));

    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:GetObject',
            Condition: {
              StringEquals: {
                'AWS:SourceAccount': {
                  Ref: 'AWS::AccountId',
                },
              },
              StringLike: {
                'AWS:SourceArn': {
                  'Fn::Join': Match.anyValue(),
                },
              },
            },
            Effect: 'Allow',
            Principal: {
              Service: 'cloudfront.amazonaws.com',
            },
          }),
        ]),
      },
    });
  });

  it('Media bucket은 final TTS run을 만료하지 않고 incomplete multipart만 중단한다', () => {
    const template = Template.fromStack(new DataStack(new App(), 'TestData'));

    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            AbortIncompleteMultipartUpload: {
              DaysAfterInitiation: 1,
            },
            Prefix: 'private/tts/runs/',
            Status: 'Enabled',
          }),
        ]),
      },
    });
    const buckets = Object.values(
      template.findResources('AWS::S3::Bucket') as Record<
        string,
        {
          Properties?: {
            LifecycleConfiguration?: {
              Rules?: Array<{ Prefix?: string; ExpirationInDays?: number }>;
            };
          };
        }
      >,
    );
    const runRules = buckets.flatMap(
      ({ Properties }) =>
        Properties?.LifecycleConfiguration?.Rules?.filter(
          ({ Prefix }) => Prefix === 'private/tts/runs/',
        ) ?? [],
    );
    runRules.forEach((rule) => {
      expect(rule).not.toHaveProperty('ExpirationInDays');
    });
  });

  it('배포 뒤 media private key를 넣을 Secret ARN을 출력한다', () => {
    const template = Template.fromStack(new DataStack(new App(), 'TestData'));

    template.hasOutput('MediaPrivateKeySecretArn', {
      Value: Match.anyValue(),
    });
  });
});
