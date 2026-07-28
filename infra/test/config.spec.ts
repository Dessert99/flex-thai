/** 잘못된 production 설정이 CloudFormation까지 전달되지 않게 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  readInfrastructureConfig,
  readInfrastructureConfigFromSources,
} from '../src/config.js';

describe('readInfrastructureConfig', () => {
  it('필수 production 설정이 빠지면 synth 전에 실패한다', () => {
    expect(() => readInfrastructureConfig({})).toThrow();
  });

  it('production TTS voice preset UUID가 빠지면 synth 전에 실패한다', () => {
    expect(() =>
      readInfrastructureConfig({
        account: '123456789012',
        rootDomain: 'example.com',
        hostedZoneId: 'Z0123456789EXAMPLE',
        alertEmail: 'owner@example.com',
        githubRepository: 'Dessert99/flex-thai',
        mediaPublicKeyPem:
          '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
      }),
    ).toThrow();
  });

  it('서울 애플리케이션과 버지니아 edge 리전을 고정한다', () => {
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

    expect(config.appRegion).toBe('ap-northeast-2');
    expect(config.edgeRegion).toBe('us-east-1');
  });

  it('CloudFront media 공개 키의 마지막 개행을 제거한다', () => {
    const mediaPublicKeyPem =
      '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----';
    const config = readInfrastructureConfig({
      account: '123456789012',
      rootDomain: 'example.com',
      hostedZoneId: 'Z0123456789EXAMPLE',
      alertEmail: 'owner@example.com',
      githubRepository: 'Dessert99/flex-thai',
      ttsVoicePresetId: '00000000-0000-4000-8000-000000000777',
      mediaPublicKeyPem: `${mediaPublicKeyPem}\n`,
    });

    expect(config.mediaPublicKeyPem).toBe(mediaPublicKeyPem);
  });

  it('CDK context에 공개 키가 없으면 실행 환경의 공개 키를 사용한다', () => {
    const mediaPublicKeyPem =
      '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----';
    const config = readInfrastructureConfigFromSources(
      {
        account: '123456789012',
        rootDomain: 'example.com',
        hostedZoneId: 'Z0123456789EXAMPLE',
        alertEmail: 'owner@example.com',
        githubRepository: 'Dessert99/flex-thai',
        ttsVoicePresetId: '00000000-0000-4000-8000-000000000777',
      },
      {
        MEDIA_PUBLIC_KEY_PEM: mediaPublicKeyPem,
        TTS_VOICE_PRESET_ID: '00000000-0000-4000-8000-000000000777',
      },
    );

    expect(config.mediaPublicKeyPem).toBe(mediaPublicKeyPem);
  });

  it('CloudFront media public key가 PEM 형식이 아니면 거부한다', () => {
    expect(() =>
      readInfrastructureConfig({
        account: '123456789012',
        rootDomain: 'example.com',
        hostedZoneId: 'Z0123456789EXAMPLE',
        alertEmail: 'owner@example.com',
        githubRepository: 'Dessert99/flex-thai',
        ttsVoicePresetId: '00000000-0000-4000-8000-000000000777',
        mediaPublicKeyPem: 'test-public-key',
      }),
    ).toThrow('CloudFront media public key는 PEM 형식이어야 한다');
  });
});
