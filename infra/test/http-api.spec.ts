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
  ttsVoicePresetId: '00000000-0000-4000-8000-000000000777',
  mediaPublicKeyPem:
    '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
});

type SynthesizedRoute = {
  Properties: {
    AuthorizationType: string;
    RouteKey: string;
  };
};

type SynthesizedLambda = {
  Properties: {
    Environment?: {
      Variables?: Record<string, unknown>;
    };
    Handler?: string;
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
  'DELETE /api/v1/admin/content-error-reports/{reportId}/assignee',
  'DELETE /api/v1/admin/content-production/question-candidates/{candidateId}',
  'DELETE /api/v1/admin/content-production/vocabulary-candidates/{candidateId}',
  'DELETE /api/v1/admin/question-type-versions/{versionId}/examples/{exampleId}',
  'DELETE /api/v1/admin/vocabularies/{vocabularyId}/relations/{relationId}',
  'DELETE /api/v1/me/saved-questions/{questionId}',
  'DELETE /api/v1/me/wordbooks/{wordbookId}',
  'DELETE /api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
  'GET /api/v1/admin/concepts',
  'GET /api/v1/admin/concepts/{conceptId}',
  'GET /api/v1/admin/audit-logs',
  'GET /api/v1/admin/audit-logs/{auditLogId}',
  'GET /api/v1/admin/content-imports',
  'GET /api/v1/admin/content-imports/{importId}',
  'GET /api/v1/admin/content-error-reports',
  'GET /api/v1/admin/content-error-reports/{reportId}',
  'GET /api/v1/admin/content-production/jobs',
  'GET /api/v1/admin/content-production/jobs/{jobId}',
  'GET /api/v1/admin/content-production/presets',
  'GET /api/v1/admin/content-production/preset-versions',
  'GET /api/v1/admin/content-production/question-candidates',
  'GET /api/v1/admin/content-production/question-candidates/{candidateId}',
  'GET /api/v1/admin/content-production/vocabulary-candidates',
  'GET /api/v1/admin/content-production/vocabulary-candidates/{candidateId}',
  'GET /api/v1/admin/home',
  'GET /api/v1/admin/media-assets/{mediaAssetId}',
  'GET /api/v1/admin/questions',
  'GET /api/v1/admin/questions/{questionId}',
  'GET /api/v1/admin/question-taxonomy',
  'GET /api/v1/admin/tts/jobs',
  'GET /api/v1/admin/tts/jobs/{jobId}',
  'GET /api/v1/admin/tts/items/{itemId}/audio',
  'GET /api/v1/admin/tts/presets',
  'GET /api/v1/admin/tts/presets/{presetId}',
  'GET /api/v1/admin/tts/questions/{questionId}/versions/{versionId}/readiness',
  'GET /api/v1/admin/usage-cost',
  'GET /api/v1/admin/usage-cost/settings',
  'GET /api/v1/admin/users',
  'GET /api/v1/admin/vocabularies',
  'GET /api/v1/admin/vocabularies/{vocabularyId}',
  'GET /api/v1/concepts',
  'GET /api/v1/concepts/{conceptId}',
  'GET /api/v1/me',
  'GET /api/v1/me/question-attempts',
  'GET /api/v1/me/recommendations',
  'GET /api/v1/me/vocabularies/{vocabularyId}/wordbook-memberships',
  'GET /api/v1/me/vocabulary-practice/sessions/{sessionId}',
  'GET /api/v1/me/wordbooks',
  'GET /api/v1/me/wordbooks/{wordbookId}/items',
  'GET /api/v1/questions',
  'GET /api/v1/questions/{questionId}',
  'GET /api/v1/vocabularies',
  'GET /api/v1/vocabularies/{vocabularyId}',
  'GET /api/v1/vocabularies/{vocabularyId}/questions',
  'PATCH /api/v1/admin/users/{userId}/status',
  'PATCH /api/v1/admin/users/{userId}/role',
  'PATCH /api/v1/me/wordbooks/{wordbookId}',
  'POST /api/v1/admin/content-imports',
  'POST /api/v1/admin/content-production/jobs',
  'POST /api/v1/admin/content-production/jobs/{jobId}/retry',
  'POST /api/v1/admin/content-production/presets',
  'POST /api/v1/admin/content-production/presets/{presetId}/enabled',
  'POST /api/v1/admin/content-production/presets/{presetId}/versions',
  'POST /api/v1/admin/content-production/prompt-previews',
  'POST /api/v1/admin/content-production/question-candidates/{candidateId}/approve',
  'POST /api/v1/admin/content-production/question-candidates/{candidateId}/regenerate',
  'POST /api/v1/admin/content-production/vocabulary-candidates/{candidateId}/approve',
  'POST /api/v1/admin/content-production/uploads/policies',
  'POST /api/v1/admin/content-production/uploads/{uploadId}/complete',
  'POST /api/v1/admin/concept-versions/{versionId}/publish',
  'POST /api/v1/admin/concept-versions/{versionId}/validate',
  'POST /api/v1/admin/concepts',
  'POST /api/v1/admin/concepts/{conceptId}/hide',
  'POST /api/v1/admin/concepts/{conceptId}/restore',
  'POST /api/v1/admin/concepts/{conceptId}/versions',
  'POST /api/v1/admin/media-assets/audio-upload-requests',
  'POST /api/v1/admin/media-assets/{mediaAssetId}/complete',
  'POST /api/v1/admin/questions/{questionId}/hide',
  'POST /api/v1/admin/questions/{questionId}/restore',
  'POST /api/v1/admin/questions/{questionId}/versions',
  'POST /api/v1/admin/questions/{questionId}/versions/{versionId}/tts-jobs',
  'POST /api/v1/admin/question-tags',
  'POST /api/v1/admin/question-tags/{id}/archive',
  'POST /api/v1/admin/question-topics',
  'POST /api/v1/admin/question-topics/{id}/archive',
  'POST /api/v1/admin/question-type-versions/{versionId}/activate',
  'POST /api/v1/admin/question-type-versions/{versionId}/examples',
  'POST /api/v1/admin/question-type-versions/{versionId}/retire',
  'POST /api/v1/admin/question-types',
  'POST /api/v1/admin/question-types/{questionTypeId}/versions',
  'POST /api/v1/admin/question-versions/{versionId}/invalidate',
  'POST /api/v1/admin/question-versions/{versionId}/publish',
  'POST /api/v1/admin/question-versions/{versionId}/validate',
  'POST /api/v1/admin/tts/items/{itemId}/retry',
  'POST /api/v1/admin/tts/jobs/{jobId}/retry',
  'POST /api/v1/admin/tts/presets',
  'POST /api/v1/admin/tts/presets/{presetId}/disable',
  'POST /api/v1/admin/tts/presets/{presetId}/enable',
  'POST /api/v1/admin/tts/presets/{presetId}/versions',
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
  'POST /api/v1/me/vocabulary-practice/sessions',
  'POST /api/v1/me/vocabulary-practice/sessions/{sessionId}/questions/{questionId}/answers',
  'POST /api/v1/me/wordbooks',
  'POST /api/v1/me/wordbooks/{wordbookId}/items/copy',
  'POST /api/v1/me/wordbooks/{wordbookId}/items/move',
  'POST /api/v1/me/wordbooks/{wordbookId}/items/remove',
  'POST /api/v1/questions/{questionId}/attempts',
  'PUT /api/v1/admin/question-versions/{versionId}',
  'PUT /api/v1/admin/question-type-versions/{versionId}/difficulty-criteria',
  'PUT /api/v1/admin/concept-versions/{versionId}',
  'PUT /api/v1/admin/content-error-reports/{reportId}/assignee',
  'PUT /api/v1/admin/content-error-reports/{reportId}/status',
  'PUT /api/v1/admin/usage-cost/settings',
  'PUT /api/v1/admin/vocabularies/{vocabularyId}',
  'PUT /api/v1/admin/vocabularies/{vocabularyId}/relations/{relationId}',
  'PUT /api/v1/me/saved-questions/{questionId}',
  'PUT /api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
] as const;

describe('HttpApi 운영 API 경계', () => {
  it('API Lambda의 실행 시간과 동시성을 제한한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'HttpData');
    const stack = new ApplicationStack(app, 'HttpApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
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
      mediaKeyPairId: 'KTESTMEDIAKEY',
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

  it('production runtime에 값 대신 secret ARN과 media 설정을 전달한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'HttpRuntimeData');
    const stack = new ApplicationStack(app, 'HttpRuntimeApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'lambda.handler',
      Environment: {
        Variables: Match.objectLike({
          CHALLENGE_HMAC_PEPPER_SECRET_ARN: Match.anyValue(),
          CUSTOM_AUTH_SECRET_ARN: Match.anyValue(),
          EMAIL_LINK_CONFIRMATION_URL: 'https://www.example.com/login/confirm',
          MEDIA_BUCKET_NAME: Match.anyValue(),
          MEDIA_CDN_BASE_URL: 'https://www.example.com/media',
          MEDIA_KEY_PAIR_ID: 'KTESTMEDIAKEY',
          MEDIA_PRIVATE_KEY_SECRET_ARN: Match.anyValue(),
          TTS_VOICE_PRESET_ID: '00000000-0000-4000-8000-000000000777',
        }),
      },
    });
    const apiFunctions = Object.values(
      template.findResources('AWS::Lambda::Function') as Record<
        string,
        SynthesizedLambda
      >,
    ).filter(({ Properties }) => Properties.Handler === 'lambda.handler');
    expect(apiFunctions).toHaveLength(1);
    expect(
      apiFunctions[0]?.Properties.Environment?.Variables?.CUSTOM_AUTH_SECRET,
    ).toBe(undefined);
    expect(
      apiFunctions[0]?.Properties.Environment?.Variables?.CHALLENGE_HMAC_PEPPER,
    ).toBe(undefined);
    expect(
      apiFunctions[0]?.Properties.Environment?.Variables
        ?.AUTH_LIMIT_PARAMETER_PREFIX,
    ).toBe(undefined);
  });

  it('api custom domain과 www CORS origin을 사용한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'HttpDomainData');
    const stack = new ApplicationStack(app, 'HttpDomainApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
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
