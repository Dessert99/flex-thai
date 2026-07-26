/** 공개 인증 route 외의 Job API가 JWT 없이 열리지 않게 고정한다 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ApplicationStack } from '../src/application-stack.js';
import { readInfrastructureConfig } from '../src/config.js';
import { DataStack } from '../src/data-stack.js';

const config = readInfrastructureConfig({
  account: '123456789012',
  rootDomain: 'example.com',
  hostedZoneId: 'Z0123456789EXAMPLE',
  alertEmail: 'owner@example.com',
  githubRepository: 'Dessert99/flex-thai',
  mediaPublicKeyPem:
    '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
});

type SynthesizedRoute = {
  Properties: {
    RouteKey: string;
  };
};

describe('HttpApi 운영 API 경계', () => {
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

  it('실제 v1 인증·wordbook·관리자 route를 권한별로 연결한다', () => {
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
      RouteKey: 'POST /api/v1/jobs',
      AuthorizationType: 'JWT',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /health',
      AuthorizationType: 'NONE',
    });
    for (const routeKey of [
      'POST /api/v1/auth/challenges',
      'POST /api/v1/auth/challenges/{challengeId}/code',
      'POST /api/v1/auth/challenges/{challengeId}/link',
      'POST /api/v1/auth/challenges/{challengeId}/resend',
      'POST /api/v1/auth/mfa/totp/challenge',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
    ]) {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: routeKey,
        AuthorizationType: 'NONE',
      });
    }
    for (const routeKey of [
      'GET /api/v1/me',
      'POST /api/v1/auth/mfa/totp/setup',
      'POST /api/v1/auth/mfa/totp/setup/verify',
      'GET /api/v1/admin/users',
      'PATCH /api/v1/admin/users/{userId}/status',
      'POST /api/v1/admin/users/invitations',
      'GET /api/v1/me/wordbooks',
      'POST /api/v1/me/wordbooks',
      'PATCH /api/v1/me/wordbooks/{wordbookId}',
      'DELETE /api/v1/me/wordbooks/{wordbookId}',
      'GET /api/v1/me/wordbooks/{wordbookId}/items',
      'PUT /api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
      'DELETE /api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
      'POST /api/v1/me/wordbooks/{wordbookId}/items/copy',
      'POST /api/v1/me/wordbooks/{wordbookId}/items/move',
      'POST /api/v1/me/wordbooks/{wordbookId}/items/remove',
      'GET /api/v1/me/vocabularies/{vocabularyId}/wordbook-memberships',
    ]) {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: routeKey,
        AuthorizationType: 'JWT',
      });
    }
    const routeKeys = Object.values(
      template.findResources('AWS::ApiGatewayV2::Route') as Record<
        string,
        SynthesizedRoute
      >,
    ).map(({ Properties }) => Properties.RouteKey);
    expect(routeKeys).not.toContain('POST /auth/signup');
    expect(routeKeys).not.toContain('POST /auth/password/reset');
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

  it('api custom domain과 www CORS origin을 사용한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'HttpDomainData');
    const stack = new ApplicationStack(app, 'HttpDomainApplication', {
      config,
      dataStack,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'api.example.com',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', {
      DomainName: 'api.example.com',
      DomainNameConfigurations: Match.arrayWith([
        Match.objectLike({
          EndpointType: 'REGIONAL',
          SecurityPolicy: 'TLS_1_2',
        }),
      ]),
    });
    template.resourceCountIs('AWS::ApiGatewayV2::ApiMapping', 1);
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'api.example.com.',
      Type: 'A',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['https://www.example.com', 'http://localhost:5173'],
      }),
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          ALLOWED_ORIGINS: 'https://www.example.com,http://localhost:5173',
        }),
      },
    });
    template.hasOutput('*', {
      Value: 'https://api.example.com',
    });
    expect(JSON.stringify(template.toJSON())).not.toContain('app.example.com');
  });
});
