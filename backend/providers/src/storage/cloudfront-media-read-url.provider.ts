/** Secrets Manager의 RSA key로 private CloudFront media URL을 서명한다 */
import {
  GetSecretValueCommand,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import type { MediaReadUrlProvider } from '@flex-thia/domain';
import { createPrivateKey, createSign } from 'node:crypto';

const INVALID_CDN_CONFIG_ERROR = '미디어 CDN 설정이 올바르지 않습니다';
const INVALID_STORAGE_KEY_ERROR = '미디어 storage key가 올바르지 않습니다';
const INVALID_EXPIRY_ERROR = '미디어 URL 만료 시각이 올바르지 않습니다';
const SIGNING_ERROR = '미디어 읽기 URL을 생성할 수 없습니다';
const CONTROL_CHARACTER = /\p{Cc}/u;
const ABSOLUTE_SCHEME = /^[a-z][a-z\d+.-]*:/iu;

const readResourceBaseUrl = (value: string): string => {
  try {
    if (value.includes('?') || value.includes('#')) {
      throw new Error();
    }
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return url.toString().replace(/\/+$/u, '');
  } catch {
    throw new Error(INVALID_CDN_CONFIG_ERROR);
  }
};

const encodeStorageKey = (storageKey: string): string => {
  if (
    !storageKey ||
    storageKey.startsWith('/') ||
    ABSOLUTE_SCHEME.test(storageKey) ||
    CONTROL_CHARACTER.test(storageKey)
  ) {
    throw new Error(INVALID_STORAGE_KEY_ERROR);
  }

  const segments = storageKey.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(INVALID_STORAGE_KEY_ERROR);
  }

  try {
    // Segment별 인코딩으로 object key의 계층만 유지하고 URL 경계 문자는 데이터로 가둔다.
    return segments
      .map((segment) => encodeURIComponent(segment).replaceAll('*', '%2A'))
      .join('/');
  } catch {
    throw new Error(INVALID_STORAGE_KEY_ERROR);
  }
};

const toCloudFrontBase64 = (value: Buffer): string =>
  value
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('=', '_')
    .replaceAll('/', '~');

/** Secret을 한 번만 읽어 caller 만료 시각의 CloudFront canned-policy URL을 만든다 */
export class CloudFrontMediaReadUrlProvider implements MediaReadUrlProvider {
  private readonly resourceBaseUrl: string;
  private privateKeyPromise: Promise<string> | undefined;

  constructor(
    private readonly client: SecretsManagerClient,
    cdnBaseUrl: string,
    private readonly keyPairId: string,
    private readonly privateKeySecretArn: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.resourceBaseUrl = readResourceBaseUrl(cdnBaseUrl);
    if (!keyPairId.trim() || !privateKeySecretArn.trim()) {
      throw new Error(INVALID_CDN_CONFIG_ERROR);
    }
  }

  /** 검증된 resource와 서명 query로 제한된 읽기 경계를 전달한다 */
  async createReadUrl(storageKey: string, expiresAt: Date): Promise<string> {
    const encodedStorageKey = encodeStorageKey(storageKey);
    const expires = Math.floor(expiresAt.getTime() / 1000);
    const now = Math.floor(this.now().getTime() / 1000);
    if (
      !Number.isSafeInteger(expires) ||
      !Number.isSafeInteger(now) ||
      expires <= now
    ) {
      throw new Error(INVALID_EXPIRY_ERROR);
    }

    const resource = `${this.resourceBaseUrl}/${encodedStorageKey}`;
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: { DateLessThan: { 'AWS:EpochTime': expires } },
        },
      ],
    });

    try {
      const privateKey = await this.getPrivateKey();
      const signature = toCloudFrontBase64(
        createSign('RSA-SHA1').update(policy).sign(privateKey),
      );
      return (
        `${resource}?Expires=${expires}` +
        `&Signature=${signature}` +
        `&Key-Pair-Id=${encodeURIComponent(this.keyPairId)}`
      );
    } catch {
      // AWS·OpenSSL 세부 오류에 secret이나 object 경로가 섞여도 외부로 전달하지 않는다.
      throw new Error(SIGNING_ERROR);
    }
  }

  private getPrivateKey(): Promise<string> {
    if (this.privateKeyPromise) {
      return this.privateKeyPromise;
    }

    const pending = this.loadPrivateKey();
    this.privateKeyPromise = pending;
    // 동시 호출은 pending을 공유하되 실패한 Secret은 다음 호출에서 복구할 수 있게 비운다.
    void pending.catch(() => {
      if (this.privateKeyPromise === pending) {
        this.privateKeyPromise = undefined;
      }
    });
    return pending;
  }

  private async loadPrivateKey(): Promise<string> {
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({ SecretId: this.privateKeySecretArn }),
      );
      if (!result.SecretString) {
        throw new Error();
      }
      const key = createPrivateKey(result.SecretString);
      if (key.asymmetricKeyType !== 'rsa') {
        throw new Error();
      }
      return result.SecretString;
    } catch {
      throw new Error(SIGNING_ERROR);
    }
  }
}
