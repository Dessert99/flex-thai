/** 학교 이메일 확인용 Cognito Custom Auth 경계를 고정한다 */
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

type SynthesizedLambda = {
  Properties: {
    Environment?: {
      Variables?: Record<string, unknown>;
    };
    Handler?: string;
    Role?: {
      'Fn::GetAtt': [string, string];
    };
  };
};

describe('Identity 학교 이메일 인증 경계', () => {
  it('Cognito Custom Auth와 7일 회전식 refresh token만 허용한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentityData');
    const stack = new ApplicationStack(app, 'IdentityApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: ['ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      PreventUserExistenceErrors: 'ENABLED',
      EnableTokenRevocation: true,
      RefreshTokenValidity: 7,
      TokenValidityUnits: Match.objectLike({
        RefreshToken: 'days',
      }),
      RefreshTokenRotation: Match.objectLike({
        Feature: 'ENABLED',
        RetryGracePeriodSeconds: 10,
      }),
      AllowedOAuthFlowsUserPoolClient: false,
      CallbackURLs: Match.absent(),
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
      },
      MfaConfiguration: 'OPTIONAL',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
      LambdaConfig: Match.objectLike({
        CreateAuthChallenge: Match.anyValue(),
        DefineAuthChallenge: Match.anyValue(),
        VerifyAuthChallengeResponse: Match.anyValue(),
      }),
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
          RequireUppercase: true,
        },
      },
    });
  });

  it('SES identity와 세 개의 custom auth Lambda를 만든다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentityDataResources');
    const stack = new ApplicationStack(app, 'IdentityResources', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Lambda::Function', 7);
    template.resourceCountIs('AWS::SES::EmailIdentity', 1);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ses:SendEmail',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  it('API와 Create Auth Challenge에 secret 값 대신 ARN만 전달한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentitySecretData');
    const stack = new ApplicationStack(app, 'IdentitySecretApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);
    const functions = Object.values(
      template.findResources('AWS::Lambda::Function') as Record<
        string,
        SynthesizedLambda
      >,
    );
    const api = functions.find(
      ({ Properties }) => Properties.Handler === 'lambda.handler',
    );
    const createChallenge = functions.find(
      ({ Properties }) =>
        Properties.Environment?.Variables?.CUSTOM_AUTH_SECRET_ARN !==
          undefined && Properties.Handler === 'index.createAuthChallenge',
    );

    expect(
      api?.Properties.Environment?.Variables?.CUSTOM_AUTH_SECRET_ARN,
    ).toEqual(
      createChallenge?.Properties.Environment?.Variables
        ?.CUSTOM_AUTH_SECRET_ARN,
    );
    expect(api?.Properties.Environment?.Variables?.CUSTOM_AUTH_SECRET).toBe(
      undefined,
    );
    expect(
      createChallenge?.Properties.Environment?.Variables?.CUSTOM_AUTH_SECRET,
    ).toBe(undefined);
    expect(
      JSON.stringify(
        api?.Properties.Environment?.Variables?.CUSTOM_AUTH_SECRET_ARN,
      ),
    ).toContain('CustomAuthSecret');
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: Match.objectLike({
        ExcludePunctuation: true,
        PasswordLength: 48,
      }),
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });

    const customAuthSecretLogicalId = Object.keys(
      template.findResources('AWS::SecretsManager::Secret'),
    )[0];
    const createChallengeRoleLogicalId =
      createChallenge?.Properties.Role?.['Fn::GetAtt'][0];
    expect(customAuthSecretLogicalId).toBeDefined();
    expect(createChallengeRoleLogicalId).toBeDefined();
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          {
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
            ],
            Effect: 'Allow',
            Resource: { Ref: customAuthSecretLogicalId },
          },
        ]),
      },
      Roles: Match.arrayWith([{ Ref: createChallengeRoleLogicalId }]),
    });
  });

  it('API 계정 생성 권한은 관리자 생성과 임시 비밀번호 설정으로 제한한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentityIamData');
    const stack = new ApplicationStack(app, 'IdentityIamApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              'cognito-idp:AdminCreateUser',
              'cognito-idp:AdminSetUserPassword',
            ],
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  it('Cognito가 전화번호 검증 SMS를 보낼 전용 role을 가진다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentitySmsData');
    const stack = new ApplicationStack(app, 'IdentitySmsApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      SmsConfiguration: Match.objectLike({
        SnsCallerArn: Match.anyValue(),
      }),
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sns:Publish',
            Effect: 'Allow',
            Resource: '*',
          }),
        ]),
      },
    });
  });

  it('서울 Cognito SMS는 AWS가 요구하는 도쿄 SNS 리전을 사용한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentityUrlData');
    const stack = new ApplicationStack(app, 'IdentityUrlApplication', {
      config,
      dataStack,
      mediaKeyPairId: 'KTESTMEDIAKEY',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      SmsConfiguration: Match.objectLike({
        SnsRegion: 'ap-northeast-1',
      }),
    });
  });
});
