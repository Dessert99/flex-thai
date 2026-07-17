/** OTP HMAC과 Cognito session 암호화를 Node crypto로 구현한다 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { ChallengeCryptoPort } from '@flex-thia/domain';

/** HMAC-SHA256과 AES-256-GCM을 사용하는 challenge crypto adapter */
export class ChallengeCrypto implements ChallengeCryptoPort {
  constructor(
    private readonly encryptionKey: Uint8Array,
    private readonly pepper: string,
  ) {
    if (encryptionKey.byteLength !== 32) {
      throw new Error('AES-256-GCM key는 32바이트여야 합니다');
    }

    if (!pepper) {
      throw new Error('challenge pepper가 필요합니다');
    }
  }

  /** random salt와 secret pepper로 원문을 복구할 수 없는 HMAC을 만든다 */
  hashAnswer(answer: string, salt: Uint8Array = randomBytes(16)): string {
    const saltBuffer = Buffer.from(salt);
    const digest = createHmac('sha256', this.pepper)
      .update(saltBuffer)
      .update(answer, 'utf8')
      .digest();
    return `${saltBuffer.toString('base64')}.${digest.toString('base64')}`;
  }

  /** 잘못된 저장 형식도 timing 비교 전에 안전하게 거부한다 */
  verifyAnswer(answer: string, stored: string): boolean {
    const [saltValue, digestValue, extra] = stored.split('.');

    if (!saltValue || !digestValue || extra) {
      return false;
    }

    const salt = Buffer.from(saltValue, 'base64');
    const expected = Buffer.from(digestValue, 'base64');

    if (salt.byteLength === 0 || expected.byteLength !== 32) {
      return false;
    }

    const actualStored = this.hashAnswer(answer, salt);
    const actualValue = actualStored.split('.')[1];

    if (!actualValue) {
      return false;
    }

    const actual = Buffer.from(actualValue, 'base64');
    return timingSafeEqual(actual, expected);
  }

  /** Cognito session을 12바이트 IV의 AES-256-GCM으로 암호화한다 */
  encryptSession(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [iv, tag, ciphertext]
      .map((part) => part.toString('base64'))
      .join('.');
  }

  /** GCM tag 검증을 통과한 Cognito session만 복호화한다 */
  decryptSession(value: string): string {
    const [ivValue, tagValue, ciphertextValue, extra] = value.split('.');

    if (!ivValue || !tagValue || !ciphertextValue || extra) {
      throw new Error('암호화된 Cognito session 형식이 잘못되었습니다');
    }

    const iv = Buffer.from(ivValue, 'base64');
    const tag = Buffer.from(tagValue, 'base64');
    const ciphertext = Buffer.from(ciphertextValue, 'base64');

    if (iv.byteLength !== 12 || tag.byteLength !== 16) {
      throw new Error('암호화된 Cognito session 형식이 잘못되었습니다');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
