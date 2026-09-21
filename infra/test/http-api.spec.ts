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
});

type SynthesizedRoute = {
  Properties: {
    AuthorizationType: string;
    RouteKey: string;
  };
};

const publicRouteKeys = [
  'GET /health',
  'GET /ready',
  'POST /api/v1/auth/challenges',
  'POST /api/v1/auth/challenges/{challengeId}/code',
  'POST /api/v1/auth/challenges/{challengeId}/link',
  'POST /api/v1/auth/challenges/{challengeId}/resend',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/mfa/totp/challenge',
  'POST /api/v1/auth/refresh',
] as const;

const protectedRouteKeys = [
  'POST /api/v1/admin/vocabulary-extraction/uploads/policies',
  'POST /api/v1/admin/vocabulary-extraction/uploads/{uploadId}/complete',
  'DELETE /api/v1/admin/content-error-reports/{reportId}/assignee',
  'DELETE /api/v1/admin/vocabularies/{vocabularyId}/relations/{relationId}',
  'DELETE /api/v1/me/wordbooks/{wordbookId}',
  'DELETE /api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
  'GET /api/v1/admin/audit-logs',
  'GET /api/v1/admin/audit-logs/{auditLogId}',
  'GET /api/v1/admin/content-error-reports',
  'GET /api/v1/admin/content-error-reports/{reportId}',
  'GET /api/v1/admin/home',
  'GET /api/v1/admin/users',
  'GET /api/v1/admin/vocabularies',
  'GET /api/v1/admin/vocabularies/{vocabularyId}',
  'GET /api/v1/me',
  'GET /api/v1/me/recommendations',
  'GET /api/v1/me/vocabularies/{vocabularyId}/wordbook-memberships',
  'GET /api/v1/me/wordbooks',
  'GET /api/v1/me/wordbooks/{wordbookId}/items',
  'GET /api/v1/vocabularies',
  'GET /api/v1/vocabularies/{vocabularyId}',
  'PATCH /api/v1/admin/users/{userId}/status',
  'PATCH /api/v1/admin/users/{userId}/role',
  'PATCH /api/v1/me/wordbooks/{wordbookId}',
  'POST /api/v1/admin/users/invitations',
  'POST /api/v1/admin/vocabularies/{vocabularyId}/hide',
  'POST /api/v1/admin/vocabularies/{vocabularyId}/merge',
  'POST /api/v1/admin/vocabularies/{vocabularyId}/merge-preview',
  'POST /api/v1/admin/vocabularies/{vocabularyId}/publish',
  'POST /api/v1/admin/vocabularies/{vocabularyId}/relations',
  'POST /api/v1/admin/vocabularies/{vocabularyId}/restore',
  'POST /api/v1/auth/mfa/totp/setup',
  'POST /api/v1/auth/mfa/totp/setup/verify',
  'POST /api/v1/content-error-reports',
  'POST /api/v1/me/wordbooks',
  'POST /api/v1/me/wordbooks/{wordbookId}/items/copy',
  'POST /api/v1/me/wordbooks/{wordbookId}/items/move',
  'POST /api/v1/me/wordbooks/{wordbookId}/items/remove',
  'PUT /api/v1/admin/content-error-reports/{reportId}/assignee',
  'PUT /api/v1/admin/content-error-reports/{reportId}/status',
  'PUT /api/v1/admin/vocabularies/{vocabularyId}',
  'PUT /api/v1/admin/vocabularies/{vocabularyId}/relations/{relationId}',
  'PUT /api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
] as const;

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

  it('활성 OpenAPI operation만 권한별로 빠짐없이 연결한다', () => {
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
    const routes = Object.values(
      template.findResources('AWS::ApiGatewayV2::Route') as Record<
        string,
        SynthesizedRoute
      >,
    );
    const actualPublicRouteKeys = routes
      .filter(({ Properties }) => Properties.AuthorizationType === 'NONE')
      .map(({ Properties }) => Properties.RouteKey)
      .sort();
    const actualProtectedRouteKeys = routes
      .filter(({ Properties }) => Properties.AuthorizationType === 'JWT')
      .map(({ Properties }) => Properties.RouteKey)
      .sort();

    expect(actualPublicRouteKeys).toEqual([...publicRouteKeys].sort());
    expect(actualProtectedRouteKeys).toEqual([...protectedRouteKeys].sort());
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
