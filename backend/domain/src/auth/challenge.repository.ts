/** 이메일 인증 코드의 HMAC 검증에 필요한 port를 정의한다 */

/** 일회용 코드 원문을 저장하지 않도록 HMAC만 제공한다 */
export interface ChallengeCryptoPort {
  hashAnswer(answer: string, salt?: Uint8Array): string;
  verifyAnswer(answer: string, stored: string): boolean;
}
