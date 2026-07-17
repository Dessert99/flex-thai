/** 잘못된 production 설정이 CloudFormation까지 전달되지 않게 검증한다 */
import { describe, expect, it } from 'vitest';
import { readInfrastructureConfig } from '../src/config.js';

describe('readInfrastructureConfig', () => {
  it('필수 production 설정이 빠지면 synth 전에 실패한다', () => {
    expect(() => readInfrastructureConfig({})).toThrow();
  });

  it('서울 애플리케이션과 버지니아 edge 리전을 고정한다', () => {
    const config = readInfrastructureConfig({
      account: '123456789012',
      rootDomain: 'example.com',
      hostedZoneId: 'Z0123456789EXAMPLE',
      alertEmail: 'owner@example.com',
      githubRepository: 'Dessert99/flex-thai',
      mediaPublicKeyPem:
        '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
    });

    expect(config.appRegion).toBe('ap-northeast-2');
    expect(config.edgeRegion).toBe('us-east-1');
  });

  it('CloudFront media public key가 PEM 형식이 아니면 거부한다', () => {
    expect(() =>
      readInfrastructureConfig({
        account: '123456789012',
        rootDomain: 'example.com',
        hostedZoneId: 'Z0123456789EXAMPLE',
        alertEmail: 'owner@example.com',
        githubRepository: 'Dessert99/flex-thai',
        mediaPublicKeyPem: 'test-public-key',
      }),
    ).toThrow('CloudFront media public key는 PEM 형식이어야 한다');
  });
});
