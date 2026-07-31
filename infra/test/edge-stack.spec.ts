/** 정적 파일과 media가 S3 URL로 직접 공개되지 않게 고정한다 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, describe, expect, it } from 'vitest';
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

const webAssetPath = mkdtempSync(join(tmpdir(), 'flex-thia-web-'));
writeFileSync(join(webAssetPath, 'index.html'), '<main>web fixture</main>');

afterAll(() => {
  rmSync(webAssetPath, { force: true, recursive: true });
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

const readDistributionProperties = (
  template: Template,
): Record<string, unknown> => {
  const distributions = template.findResources(
    'AWS::CloudFront::Distribution',
  ) as unknown;
  if (!isRecord(distributions)) {
    throw new Error('CloudFront Distribution을 읽을 수 없습니다.');
  }
  const [distribution] = Object.values(distributions);
  if (!isRecord(distribution) || !isRecord(distribution.Properties)) {
    throw new Error('CloudFront Distribution이 생성되지 않았습니다.');
  }
  return distribution.Properties;
};

const readResponseHeadersPolicyProperties = (
  template: Template,
): Record<string, unknown> => {
  const policies = template.findResources(
    'AWS::CloudFront::ResponseHeadersPolicy',
  ) as unknown;
  if (!isRecord(policies)) {
    throw new Error('CloudFront ResponseHeadersPolicy를 읽을 수 없습니다.');
  }
  const [policy] = Object.values(policies);
  if (!isRecord(policy) || !isRecord(policy.Properties)) {
    throw new Error('CloudFront ResponseHeadersPolicy가 생성되지 않았습니다.');
  }
  return policy.Properties;
};

const readBucketDeploymentSources = (template: Template): unknown => {
  const deployments = template.findResources(
    'Custom::CDKBucketDeployment',
  ) as unknown;
  if (!isRecord(deployments)) {
    throw new Error('Web application 배포 자원을 읽을 수 없습니다.');
  }
  const [deployment] = Object.values(deployments);
  if (!isRecord(deployment) || !isRecord(deployment.Properties)) {
    throw new Error('Web application 배포 설정이 생성되지 않았습니다.');
  }
  return {
    sourceBucketNames: deployment.Properties.SourceBucketNames,
    sourceObjectKeys: deployment.Properties.SourceObjectKeys,
  };
};

describe('EdgeStack 웹 전송 경계', () => {
  it('Web bucket public access를 막고 CloudFront OAC만 연결한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeData');
    const stack = new EdgeStack(app, 'Edge', {
      config,
      dataStack,
      webAssetPath,
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
      webAssetPath,
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
      webAssetPath,
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

  it('명시한 web asset directory를 prune 배포하고 HTML·asset path를 무효화한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeDeploymentData');
    const stack = new EdgeStack(app, 'EdgeDeployment', {
      config,
      dataStack,
      webAssetPath,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      DistributionPaths: ['/index.html', '/assets/*'],
      Prune: true,
    });
  });

  it('주입한 web asset directory의 실제 내용으로 배포 asset을 선택한다', () => {
    const alternateWebAssetPath = mkdtempSync(
      join(tmpdir(), 'flex-thia-web-alternate-'),
    );
    writeFileSync(
      join(alternateWebAssetPath, 'index.html'),
      '<main>alternate web fixture</main>',
    );

    try {
      const app = new App();
      const firstDataStack = new DataStack(app, 'EdgeFirstAssetData');
      const firstStack = new EdgeStack(app, 'EdgeFirstAsset', {
        config,
        dataStack: firstDataStack,
        webAssetPath,
      });
      const secondDataStack = new DataStack(app, 'EdgeSecondAssetData');
      const secondStack = new EdgeStack(app, 'EdgeSecondAsset', {
        config,
        dataStack: secondDataStack,
        webAssetPath: alternateWebAssetPath,
      });

      expect(
        readBucketDeploymentSources(Template.fromStack(firstStack)),
      ).not.toEqual(
        readBucketDeploymentSources(Template.fromStack(secondStack)),
      );
    } finally {
      rmSync(alternateWebAssetPath, { force: true, recursive: true });
    }
  });

  it('없는 web asset directory는 안정된 설정 오류로 즉시 실패한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeMissingAssetData');

    expect(
      () =>
        new EdgeStack(app, 'EdgeMissingAsset', {
          config,
          dataStack,
          webAssetPath: join(webAssetPath, 'missing'),
        }),
    ).toThrow('Web asset directory does not exist.');
  });

  it('default와 asset behavior에 같은 최소 보안 응답 정책을 적용한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'EdgeSecurityData');
    const stack = new EdgeStack(app, 'EdgeSecurity', {
      config,
      dataStack,
      webAssetPath,
    });
    const template = Template.fromStack(stack);
    const distribution = readDistributionProperties(template);
    const distributionConfig = distribution.DistributionConfig;
    if (!isRecord(distributionConfig)) {
      throw new Error('CloudFront Distribution 설정을 읽을 수 없습니다.');
    }
    const defaultBehavior = distributionConfig.DefaultCacheBehavior;
    const cacheBehaviors = distributionConfig.CacheBehaviors;
    if (!isRecord(defaultBehavior) || !Array.isArray(cacheBehaviors)) {
      throw new Error('CloudFront web cache behavior를 읽을 수 없습니다.');
    }
    const assetsBehavior = cacheBehaviors.find(
      (behavior) => isRecord(behavior) && behavior.PathPattern === 'assets/*',
    );
    if (!isRecord(assetsBehavior)) {
      throw new Error('CloudFront asset cache behavior가 생성되지 않았습니다.');
    }

    expect(assetsBehavior.ResponseHeadersPolicyId).toEqual(
      defaultBehavior.ResponseHeadersPolicyId,
    );
    expect(defaultBehavior.ResponseHeadersPolicyId).toBeDefined();

    const policy = readResponseHeadersPolicyProperties(template);
    expect(policy.ResponseHeadersPolicyConfig).toMatchObject({
      SecurityHeadersConfig: {
        ContentSecurityPolicy: {
          ContentSecurityPolicy:
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.example.com https://*.s3.ap-northeast-2.amazonaws.com https://s3.ap-northeast-2.amazonaws.com",
        },
        ContentTypeOptions: { Override: true },
        FrameOptions: { FrameOption: 'DENY', Override: true },
        ReferrerPolicy: {
          ReferrerPolicy: 'strict-origin-when-cross-origin',
          Override: true,
        },
        StrictTransportSecurity: {
          AccessControlMaxAgeSec: 31536000,
          IncludeSubdomains: true,
          Override: true,
          Preload: true,
        },
      },
    });
  });
});
