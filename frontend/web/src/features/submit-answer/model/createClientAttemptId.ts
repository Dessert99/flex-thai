/** 답안 제출 멱등 키를 브라우저 보안 UUID로 생성한다 */

/** 새 논리 제출에 사용할 UUID를 한 번 생성한다 */
export function createClientAttemptId(): string {
  return crypto.randomUUID();
}
