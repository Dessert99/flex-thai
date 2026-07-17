/** 공개 인증 route 외의 Job API가 JWT 없이 열리지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { ApplicationStack } from '../src/application-stack.js';
import { readInfrastructureConfig } from '../src/config.js';
import { DataStack } from '../src/data-stack.js';

const config = readInfrastructureConfig({
  account: '123456789012',
  rootDomain: 'example.com',
  hostedZoneId: 'Z0123456789EXAMPLE',
  alertEmail: 'owner@example.com',
  githubRepository: 'Dessert99/flex-thai',
  mediaPublicKeyPem: 'test-public-key',
});

describe('HttpApi', () => {
  it('API Lambda의 실행 시간과 동시성을 제한한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'HttpData');
    const stack = new ApplicationStack(app, 'HttpApplication', {
      config,
      dataStack,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'lambda.handler',
      Timeout: 29,
      MemorySize: 1024,
      ReservedConcurrentExecutions: 5,
    });
  });

  it('Job은 JWT로 보호하고 health는 공개한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'HttpRouteData');
    const stack = new ApplicationStack(app, 'HttpRoutes', {
      config,
      dataStack,
    });
    const template = Template.fromStack(stack);

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
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 10,
        ThrottlingRateLimit: 5,
      },
      AccessLogSettings: Match.objectLike({
        Format: Match.stringLikeRegexp('requestId'),
      }),
    });
  });
});
