/** CloudFront canned-policy 서명과 private media 경로 안전성을 고정한다 */
import { createPublicKey, createSign, createVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FakeMediaReadUrlProvider } from '../fakes/fake-media-read-url.provider.js';
import { CloudFrontMediaReadUrlProvider } from './cloudfront-media-read-url.provider.js';

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD0IihxbcDOYvra
VKpEkdcFYEerYPdVqREtvsZP21sRpIanckSqC403V7hl+AH9PQQLKedAkXApv4On
T9mg3fFRX2VoajhKHEL16OtzLVesSqxYRyxsgVgSGlah1Llr1bpvzlA8S/W4NG1/
ihZ5APOp36PuZjl8rDOC0u2CVf4mcmdyUA1+v6ktd1GCyBO5jgn+OHOEHPfwdPsk
SGqt+3L8NzEJjEhzLK/vojfRiwvAKuDggoUGHgc06/xhTSFjc7qYbmKidvtF3bGZ
g4J5mrJ6ZGifCV0SAoH0lo3N9YPUkuww6d3419m9OT0Phvrj0Mf3ilxvmuMGmXSm
zbQ/ILbpAgMBAAECggEAJjN+Hpms9N6aIDXlWstzWP0C2fdXXIkTDhRvFaneazlS
dLs1sWITW9iXGyWeshCtJE4PSJQ5d97m6/RbuodgLnp99MPCQR6A/9fNl/09XdFl
fH7Onb/zlwmWCsatqQkNnlcrSPQd5BAYHj/uWkri1e8PyMsoLbEIcm0tCxsHpN4t
wSto3c3ENhkZOCMAIWtwsRGqeR2YcxLFNtWOtbG0Pd0X7sT/wSqRqtKvwENT3ijl
yRyBRL6FOYvNw2imVFBCorJthi/IMpDhrQjdMIXvXV61rBItRQoFDI+I/RlOw6HP
g3nmC0HMiHCxnF7JH7ls4DUWh02vRR2hW+7Le08S7QKBgQD9JhpKMakZTEzUSpBY
c83IfhROopYQTiyaCP2R8KMz63nbg5phUNPub8OJYtC2xB+hcFBqoREBICs6wq9P
v/OnztbADNoPviniFDlOyelB06DorKqk/ZGcyT5CdKLg51pPq3pRW1ENtlbTmaWt
5oybPVItggaQoJtIlnrRNvcrLwKBgQD24g+3vNvMODSqkoFEYtgX2U04aGcWWUi/
IPb7G6VvVJtWxlov35yCwbCI3SOf3Nhy1naxcTadFU0q/CTnDuc5O3Lu7qZfIIbL
p0bNIHmMukiBAC21FC8jqcuJasowkhcbWnA8OqzfF83Q238OqvkeodsmtI69nw/P
NfCYcEVZZwKBgQC2jey1hnx4ZuKc0Syo7NIAfJNuZacsGQPnDQa3YL6AqZZV6+C/
vwcmUmjDQYRb2LEqvZDwZDicBDPIiy7bpwQyBmItWtdCNROFGqp9G/RfaRsHz8S7
eLSySRnh2LTA1XX2MCXkV6Lq7YxNyeaFstXA+YaylKrhT0DMJuBo0WeLNwKBgFGN
saV/ZJgchQFHrh36DOor5T9Z9ZvDWK2SZSPkKQ0SxNGwakBgPKJQ+1DqxAbd/D5L
LCBHhsPzMm+dpU8SdD1KrxfQi/LmmsCRfGjsblqXerXqai7kAQJl5494UFwlFi75
/BNZSpvTkDCLIXil7+83hl5NzM1EywMnDVg91hrHAoGBAJB/TdKUVdEjhvMXALRQ
sCCPH25Wjapy6d7udxQoucmNHkm+9Ybq6Y9UeN5wIFJEKbMD2vJmRmH9rmUI1ol1
QOH6SJpnRROJz4zovHw34gwrKE8NRTQmk15BzDbb/TQxivpZEVUaoRMOEvg6WBLL
uVakvUZZBfuZ/zbHihaz7c0y
-----END PRIVATE KEY-----`;

const NOW = new Date('2026-07-24T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-07-24T00:05:00.000Z');
const GENERIC_SIGNING_ERROR = '미디어 읽기 URL을 생성할 수 없습니다';

const toCloudFrontBase64 = (value: Buffer): string =>
  value
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('=', '_')
    .replaceAll('/', '~');

describe('CloudFrontMediaReadUrlProvider', () => {
  it('encoded resource와 caller 만료 시각으로 canned-policy URL을 서명한다', async () => {
    const send = vi.fn().mockResolvedValue({ SecretString: TEST_PRIVATE_KEY });
    const provider = new CloudFrontMediaReadUrlProvider(
      { send } as never,
      'https://cdn.example.com/media/',
      'K123EXAMPLE',
      'arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:media',
      () => NOW,
    );

    const result = await provider.createReadUrl(
      'audio/태 국/?sample#*.mp3',
      EXPIRES_AT,
    );

    const resource =
      'https://cdn.example.com/media/audio/%ED%83%9C%20%EA%B5%AD/%3Fsample%23%2A.mp3';
    const expires = Math.floor(EXPIRES_AT.getTime() / 1000);
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: { DateLessThan: { 'AWS:EpochTime': expires } },
        },
      ],
    });
    const expectedSignature = toCloudFrontBase64(
      createSign('RSA-SHA1').update(policy).sign(TEST_PRIVATE_KEY),
    );
    const url = new URL(result);
    const signature = url.searchParams.get('Signature');

    expect(url.origin + url.pathname).toBe(resource);
    expect(url.searchParams.get('Expires')).toBe(String(expires));
    expect(signature).toBe(expectedSignature);
    expect(url.searchParams.get('Key-Pair-Id')).toBe('K123EXAMPLE');
    expect(result).toContain(`Signature=${expectedSignature}`);
    expect(expectedSignature).toMatch(/^[A-Za-z0-9_~-]+$/);
    expect(
      createVerify('RSA-SHA1')
        .update(policy)
        .verify(
          createPublicKey(TEST_PRIVATE_KEY),
          Buffer.from(
            expectedSignature
              .replaceAll('-', '+')
              .replaceAll('_', '=')
              .replaceAll('~', '/'),
            'base64',
          ),
        ),
    ).toBe(true);

    const command = send.mock.calls[0]?.[0] as { input: unknown } | undefined;
    expect(command?.input).toEqual({
      SecretId:
        'arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:media',
    });
  });

  it('private key secret을 최초 호출에서 한 번만 읽고 재사용한다', async () => {
    const send = vi.fn().mockResolvedValue({ SecretString: TEST_PRIVATE_KEY });
    const provider = new CloudFrontMediaReadUrlProvider(
      { send } as never,
      'https://cdn.example.com/media',
      'K123EXAMPLE',
      'secret-arn',
      () => NOW,
    );

    expect(send).not.toHaveBeenCalled();

    await Promise.all([
      provider.createReadUrl('audio/first.mp3', EXPIRES_AT),
      provider.createReadUrl('audio/second.mp3', EXPIRES_AT),
    ]);
    await provider.createReadUrl('audio/third.mp3', EXPIRES_AT);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('동시 Secret 실패를 한 번만 조회하고 다음 호출에서 복구한다', async () => {
    const leakedError = `AWS failure ${TEST_PRIVATE_KEY} audio/private.mp3`;
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error(leakedError))
      .mockResolvedValueOnce({ SecretString: TEST_PRIVATE_KEY });
    const provider = new CloudFrontMediaReadUrlProvider(
      { send } as never,
      'https://cdn.example.com/media',
      'K123EXAMPLE',
      'secret-arn',
      () => NOW,
    );

    const failed = await Promise.allSettled([
      provider.createReadUrl('audio/first.mp3', EXPIRES_AT),
      provider.createReadUrl('audio/second.mp3', EXPIRES_AT),
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(failed).toHaveLength(2);
    for (const result of failed) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        expect(message).toBe(GENERIC_SIGNING_ERROR);
        expect(message).not.toContain(TEST_PRIVATE_KEY);
        expect(message).not.toContain('audio/');
      }
    }

    await expect(
      provider.createReadUrl('audio/recovered.mp3', EXPIRES_AT),
    ).resolves.toContain('Key-Pair-Id=K123EXAMPLE');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    '',
    '/absolute.mp3',
    'https://evil.example/asset.mp3',
    '.',
    '..',
    'audio/../escape.mp3',
    'audio//empty.mp3',
    'audio/control\u0000.mp3',
    'audio/control\u0085.mp3',
  ])(
    '안전하지 않은 storage key %j를 secret 조회 전에 거절한다',
    async (key) => {
      const send = vi
        .fn()
        .mockResolvedValue({ SecretString: TEST_PRIVATE_KEY });
      const provider = new CloudFrontMediaReadUrlProvider(
        { send } as never,
        'https://cdn.example.com/media',
        'K123EXAMPLE',
        'secret-arn',
        () => NOW,
      );

      let message = '';
      try {
        await provider.createReadUrl(key, EXPIRES_AT);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toBe('미디어 storage key가 올바르지 않습니다');
      if (key) {
        expect(message).not.toContain(key);
      }
      expect(message).not.toContain(TEST_PRIVATE_KEY);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([new Date('invalid'), NOW, new Date('2026-07-23T23:59:59.000Z')])(
    '유효하지 않은 만료 시각을 거절한다',
    async (expiresAt) => {
      const send = vi.fn();
      const provider = new CloudFrontMediaReadUrlProvider(
        { send } as never,
        'https://cdn.example.com/media',
        'K123EXAMPLE',
        'secret-arn',
        () => NOW,
      );

      await expect(
        provider.createReadUrl('audio/asset.mp3', expiresAt),
      ).rejects.toThrow('미디어 URL 만료 시각이 올바르지 않습니다');
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('safe integer 범위를 벗어난 epoch seconds를 거절한다', async () => {
    const expiresAt = new Date(EXPIRES_AT);
    vi.spyOn(expiresAt, 'getTime').mockReturnValue(
      (Number.MAX_SAFE_INTEGER + 1) * 1000,
    );
    const send = vi.fn();
    const provider = new CloudFrontMediaReadUrlProvider(
      { send } as never,
      'https://cdn.example.com/media',
      'K123EXAMPLE',
      'secret-arn',
      () => NOW,
    );

    await expect(
      provider.createReadUrl('audio/asset.mp3', expiresAt),
    ).rejects.toThrow('미디어 URL 만료 시각이 올바르지 않습니다');
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { SecretBinary: new Uint8Array([1, 2, 3]) },
    { SecretString: 'not-a-private-key' },
  ])(
    '누락·binary·사용 불가 secret을 같은 안전한 오류로 감춘다',
    async (secret) => {
      const send = vi.fn().mockResolvedValue(secret);
      const provider = new CloudFrontMediaReadUrlProvider(
        { send } as never,
        'https://cdn.example.com/media',
        'K123EXAMPLE',
        'secret-arn',
        () => NOW,
      );

      await expect(
        provider.createReadUrl('audio/private-asset.mp3', EXPIRES_AT),
      ).rejects.toThrow(GENERIC_SIGNING_ERROR);
    },
  );

  it('Secrets Manager 오류 세부 정보와 storage key를 노출하지 않는다', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(
        new Error(`AWS failure ${TEST_PRIVATE_KEY} audio/private-asset.mp3`),
      );
    const provider = new CloudFrontMediaReadUrlProvider(
      { send } as never,
      'https://cdn.example.com/media',
      'K123EXAMPLE',
      'secret-arn',
      () => NOW,
    );

    let message = '';
    try {
      await provider.createReadUrl('audio/private-asset.mp3', EXPIRES_AT);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe(GENERIC_SIGNING_ERROR);
    expect(message).not.toContain(TEST_PRIVATE_KEY);
    expect(message).not.toContain('audio/private-asset.mp3');
  });

  it.each([
    'https://cdn.example.com/media?token=secret',
    'https://cdn.example.com/media?',
    'https://cdn.example.com/media#fragment',
    'https://cdn.example.com/media#',
  ])('query 또는 hash가 있는 CDN base URL을 거절한다', (baseUrl) => {
    expect(
      () =>
        new CloudFrontMediaReadUrlProvider(
          { send: vi.fn() } as never,
          baseUrl,
          'K123EXAMPLE',
          'secret-arn',
          () => NOW,
        ),
    ).toThrow('미디어 CDN 설정이 올바르지 않습니다');
  });
});

describe('FakeMediaReadUrlProvider', () => {
  it('같은 storage key에는 원문을 감춘 deterministic opaque URL을 반환한다', async () => {
    const provider = new FakeMediaReadUrlProvider();

    const first = await provider.createReadUrl(
      'private/audio/asset name.mp3',
      EXPIRES_AT,
    );
    const second = await provider.createReadUrl(
      'private/audio/asset name.mp3',
      new Date('2026-07-24T00:10:00.000Z'),
    );
    const different = await provider.createReadUrl(
      'private/audio/other.mp3',
      EXPIRES_AT,
    );

    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).toMatch(
      /^https:\/\/fake-media\.invalid\/media\/[A-Za-z0-9_-]+$/,
    );
    expect(first).not.toContain('private');
    expect(first).not.toContain('asset');
    expect(decodeURIComponent(first)).not.toContain(
      'private/audio/asset name.mp3',
    );
  });
});
