/** 로컬 production diff가 잘못된 설정으로 AWS를 조회하지 않게 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertExpectedAwsAccount,
  createProductionDiffArguments,
  createProductionInfrastructureConfig,
  readLocalProductionDiffEnvironment,
} from '../src/local-production-diff.js';

const validEnvironmentSource = {
  AWS_PROFILE: 'flex-thia-admin',
  AWS_ACCOUNT_ID: '123456789012',
  ROOT_DOMAIN: 'example.com',
  HOSTED_ZONE_ID: 'Z0123456789EXAMPLE',
  ALERT_EMAIL: 'owner@example.com',
  ALLOWED_EMAIL_DOMAINS: 'hufs.ac.kr',
  GITHUB_REPOSITORY_CONTEXT: 'Dessert99/flex-thai',
  TTS_VOICE_PRESET_ID: '00000000-0000-4000-8000-000000000777',
  MONTHLY_BUDGET_USD: '30',
  MEDIA_PUBLIC_KEY_PATH: 'media-public-key.pem',
};

describe('readLocalProductionDiffEnvironment', () => {
  it('필수 로컬 설정이 빠지면 CDK 실행 전에 실패한다', () => {
    expect(() => readLocalProductionDiffEnvironment({})).toThrow();
  });
});

describe('assertExpectedAwsAccount', () => {
  it('로그인한 AWS 계정이 설정한 계정과 다르면 실패한다', () => {
    expect(() =>
      assertExpectedAwsAccount('999999999999', '123456789012'),
    ).toThrow('AWS 계정이 일치하지 않습니다');
  });
});

describe('production diff 설정 변환', () => {
  it('전용 환경값과 공개 키를 기존 인프라 설정으로 변환한다', () => {
    const environment = readLocalProductionDiffEnvironment(
      validEnvironmentSource,
    );
    const config = createProductionInfrastructureConfig(
      environment,
      '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
    );

    expect(config).toMatchObject({
      account: '123456789012',
      rootDomain: 'example.com',
      hostedZoneId: 'Z0123456789EXAMPLE',
      allowedEmailDomains: 'hufs.ac.kr',
      monthlyBudgetUsd: 30,
      ttsVoicePresetId: '00000000-0000-4000-8000-000000000777',
    });
  });

  it('여러 줄 공개 키를 제외한 읽기 전용 CDK diff 인수를 생성한다', () => {
    const environment = readLocalProductionDiffEnvironment(
      validEnvironmentSource,
    );
    const config = createProductionInfrastructureConfig(
      environment,
      '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
    );
    const arguments_ = createProductionDiffArguments(
      config,
      environment.awsProfile,
    );

    expect(arguments_).toContain('--no-change-set');
    expect(arguments_).not.toContain('--all');
    expect(arguments_).toContain('account=123456789012');
    expect(arguments_).toContain('rootDomain=example.com');
    expect(arguments_).toContain('hostedZoneId=Z0123456789EXAMPLE');
    expect(arguments_).toContain('alertEmail=owner@example.com');
    expect(arguments_).toContain('githubRepository=Dessert99/flex-thai');
    expect(arguments_).toContain(
      'ttsVoicePresetId=00000000-0000-4000-8000-000000000777',
    );
    expect(arguments_).not.toContain(
      'mediaPublicKeyPem=-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
    );
    expect(arguments_).toContain('allowedEmailDomains=hufs.ac.kr');
    expect(arguments_).toContain('monthlyBudgetUsd=30');
  });
});
