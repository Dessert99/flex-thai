/** 정적 파일과 media가 S3 URL로 직접 공개되지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { ApplicationStack } from '../src/application-stack.js';
import { readInfrastructureConfig } from '../src/config.js';
import { DataStack } from '../src/data-stack.js';
import { EdgeStack } from '../src/edge-stack.js';

const config = readInfrastructureConfig({
  account: '123456789012',
  rootDomain: 'example.com',
  hostedZoneId: 'Z0123456789EXAMPLE',
  alertEmail: 'owner@example.com',
  githubRepository: 'Dessert99/flex-thai',
  mediaPublicKeyPem:
    '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
});

describe('EdgeStack', () => {
  it('Web bucket public access를 막고 CloudFront OAC만 연결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeData');
    const applicationStack = new ApplicationStack(app, 'EdgeApplication', {
      config,
      dataStack,
    });
    const stack = new EdgeStack(app, 'Edge', {
      config,
      dataStack,
      applicationStack,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        ViewerCertificate: Match.anyValue(),
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      }),
    });
  });

  it('app DNS와 private media key group을 만든다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeDnsData');
    const applicationStack = new ApplicationStack(app, 'EdgeDnsApplication', {
      config,
      dataStack,
    });
    const stack = new EdgeStack(app, 'EdgeDns', {
      config,
      dataStack,
      applicationStack,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    template.resourceCountIs('AWS::CloudFront::PublicKey', 1);
    template.resourceCountIs('AWS::CloudFront::KeyGroup', 1);
    template.resourceCountIs('AWS::Route53::RecordSet', 2);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/media/*',
            TrustedKeyGroups: Match.anyValue(),
          }),
        ]),
      },
    });
  });
});
