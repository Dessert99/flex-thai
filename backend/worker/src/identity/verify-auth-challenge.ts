/** Cognito custom challenge answer를 timing-safe로 비교한다 */
import { timingSafeEqual } from 'node:crypto';

/** Verify Auth Challenge handler가 사용하는 최소 Cognito event */
export interface VerifyAuthChallengeEvent {
  request: {
    privateChallengeParameters: Record<string, string | undefined>;
    challengeAnswer?: string;
  };
  response: {
    answerCorrect: boolean;
  };
}

/** private HMAC과 응답 길이가 같을 때만 timing-safe 비교를 수행한다 */
export const verifyAuthChallenge = <T extends VerifyAuthChallengeEvent>(
  event: T,
): T => {
  const expected = Buffer.from(
    event.request.privateChallengeParameters.expectedHmac ?? '',
    'utf8',
  );
  const actual = Buffer.from(event.request.challengeAnswer ?? '', 'utf8');
  event.response.answerCorrect =
    expected.byteLength > 0 &&
    expected.byteLength === actual.byteLength &&
    timingSafeEqual(expected, actual);
  return event;
};
