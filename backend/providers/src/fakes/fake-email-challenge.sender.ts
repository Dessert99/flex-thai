/** local 개발에서 passwordless 메일을 메모리 outbox로 대체한다 */
import type { EmailChallengeSender } from '@flex-thia/domain';

/** 외부 전송과 secret logging 없이 발송 입력만 보관하는 fake */
export class FakeEmailChallengeSender implements EmailChallengeSender {
  readonly messages: Array<{
    email: string;
    code: string;
    linkUrl: string;
    expiresAt: Date;
  }> = [];

  /** local 확인용 outbox에 하나의 독립된 message를 추가한다 */
  async send(input: {
    email: string;
    code: string;
    linkUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    this.messages.push({ ...input });
  }
}
