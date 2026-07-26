/** 짧은 인증 코드 원문을 저장하지 않도록 HMAC을 제공한다 */
import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import type {
  ChallengeCryptoPort,
  ChallengeSecretsFactory,
} from '@flex-thia/domain';

/** secret pepper를 섞은 HMAC-SHA256 challenge adapter */
export class ChallengeCrypto
  implements ChallengeCryptoPort, ChallengeSecretsFactory
{
  constructor(private readonly pepper: string) {
    if (!pepper) throw new Error('challenge pepper가 필요합니다');
  }

  /** 코드·링크 원문과 저장용 HMAC을 한 번에 만들어 대응을 고정한다 */
  createChallengeSecrets(): {
    code: string;
    linkToken: string;
    codeHmac: string;
    linkHmac: string;
  } {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const linkToken = randomBytes(32).toString('base64url');
    return {
      code,
      linkToken,
      codeHmac: this.hashAnswer(code),
      linkHmac: this.hashAnswer(linkToken),
    };
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
    if (!saltValue || !digestValue || extra) return false;
    const salt = Buffer.from(saltValue, 'base64');
    const expected = Buffer.from(digestValue, 'base64');
    if (salt.byteLength === 0 || expected.byteLength !== 32) return false;
    const actualValue = this.hashAnswer(answer, salt).split('.')[1];
    if (!actualValue) return false;
    return timingSafeEqual(Buffer.from(actualValue, 'base64'), expected);
  }
}
