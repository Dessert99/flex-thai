/** 정적 파일과 media가 S3 URL로 직접 공개되지 않게 고정한다 */
import { runInNewContext } from 'node:vm';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { readInfrastructureConfig } from '../src/config.js';
import { DataStack } from '../src/data-stack.js';
import { EdgeStack } from '../src/edge-stack.js';

const config = readInfrastructureConfig({
  account: '123456789012',
  rootDomain: 'example.com',
  hostedZoneId: 'Z0123456789EXAMPLE',
  alertEmail: 'owner@example.com',
  githubRepository: 'Dessert99/flex-thai',
  ttsVoicePresetId: '00000000-0000-4000-8000-000000000777',
  mediaPublicKeyPem:
    '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readRedirectFunctionCode = (template: Template): string => {
  const functions = template.findResources(
    'AWS::CloudFront::Function',
  ) as unknown;
  if (!isRecord(functions)) {
    throw new Error('CloudFront Function 목록을 읽을 수 없습니다.');
  }
  const [redirectFunction] = Object.values(functions);
  if (!isRecord(redirectFunction)) {
    throw new Error('CloudFront redirect Function이 생성되지 않았습니다.');
  }
  const properties = redirectFunction.Properties;
  if (!isRecord(properties) || typeof properties.FunctionCode !== 'string') {
    throw new Error('CloudFront redirect Function 코드를 읽을 수 없습니다.');
  }
  return properties.FunctionCode;
};

const runRedirectFunction = (code: string, request: unknown): unknown =>
  runInNewContext(
    `${code}; handler(${JSON.stringify({ request })});`,
  ) as unknown;

describe('EdgeStack 웹 전송 경계', () => {
  it('Web bucket public access를 막고 CloudFront OAC만 연결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeData');
    const stack = new EdgeStack(app, 'Edge', {
      config,
      dataStack,
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

  it('루트와 www DNS를 같은 CloudFront 배포에 연결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeDnsData');
    const stack = new EdgeStack(app, 'EdgeDns', {
      config,
      dataStack,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'www.example.com',
      SubjectAlternativeNames: ['example.com'],
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: Match.arrayWith(['example.com', 'www.example.com']),
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/media/*',
            TrustedKeyGroups: Match.anyValue(),
            FunctionAssociations: Match.anyValue(),
          }),
        ]),
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: Match.anyValue(),
        }),
      }),
    });
    template.resourceCountIs('AWS::CloudFront::PublicKey', 1);
    template.resourceCountIs('AWS::CloudFront::KeyGroup', 1);
    template.resourceCountIs('AWS::Route53::RecordSet', 4);
    for (const [name, type] of [
      ['example.com.', 'A'],
      ['example.com.', 'AAAA'],
      ['www.example.com.', 'A'],
      ['www.example.com.', 'AAAA'],
    ]) {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: name,
        Type: type,
      });
    }
    expect(JSON.stringify(template.toJSON())).not.toContain('app.example.com');
  });

  it('루트 요청의 path와 query를 보존해 www로 리다이렉트한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeRedirectData');
    const stack = new EdgeStack(app, 'EdgeRedirect', {
      config,
      dataStack,
    });
    const template = Template.fromStack(stack);
    const code = readRedirectFunctionCode(template);
    const request = {
      headers: { host: { value: 'example.com' } },
      uri: '/lessons',
      querystring: {
        level: { value: '1' },
        tag: {
          multiValue: [{ value: 'reading' }, { value: 'listening' }],
        },
      },
    };

    expect(runRedirectFunction(code, request)).toEqual({
      statusCode: 308,
      statusDescription: 'Permanent Redirect',
      headers: {
        location: {
          value:
            'https://www.example.com/lessons?level=1&tag=reading&tag=listening',
        },
      },
    });
    expect(
      runRedirectFunction(code, {
        ...request,
        headers: { host: { value: 'www.example.com' } },
      }),
    ).toEqual({
      ...request,
      headers: { host: { value: 'www.example.com' } },
    });
  });
});
