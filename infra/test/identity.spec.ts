/** 학교 이메일 검증 뒤 서버 전용 비밀번호 인증만 열리게 고정한다 */
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
  mediaPublicKeyPem:
    '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
});

describe('Identity 학교 이메일 인증 경계', () => {
  it('Cognito 관리자 비밀번호 인증과 회전식 refresh token만 허용한다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentityData');
    const stack = new ApplicationStack(app, 'IdentityApplication', {
      config,
      dataStack,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: ['ALLOW_ADMIN_USER_PASSWORD_AUTH'],
      PreventUserExistenceErrors: 'ENABLED',
      EnableTokenRevocation: true,
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
      LambdaConfig: Match.absent(),
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

  it('SES domain identity를 만들고 custom auth Lambda는 만들지 않는다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentityDataResources');
    const stack = new ApplicationStack(app, 'IdentityResources', {
      config,
      dataStack,
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Lambda::Function', 3);
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

  it('Cognito가 전화번호 검증 SMS를 보낼 전용 role을 가진다', () => {
    const app = new App();
    const dataStack = new DataStack(app, 'IdentitySmsData');
    const stack = new ApplicationStack(app, 'IdentitySmsApplication', {
      config,
      dataStack,
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
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      SmsConfiguration: Match.objectLike({
        SnsRegion: 'ap-northeast-1',
      }),
    });
  });
});
