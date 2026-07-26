/** Cognito custom challenge의 공개·비공개 parameter를 분리한다 */

/** Create Auth Challenge handler가 사용하는 최소 Cognito event */
export interface CreateAuthChallengeEvent {
  request: {
    clientMetadata?: Record<string, string | undefined>;
  };
  response: {
    publicChallengeParameters: Record<string, string>;
    privateChallengeParameters: Record<string, string>;
  };
}

/** 외부에는 일반 상태만 내보내고 답 HMAC은 private parameter로 제한한다 */
export const createAuthChallenge = <T extends CreateAuthChallengeEvent>(
  event: T,
): T => {
  const expectedHmac = event.request.clientMetadata?.expectedHmac;
  if (!expectedHmac) {
    throw new Error('custom challenge expectedHmac이 필요합니다');
  }
  event.response.publicChallengeParameters = {
    challenge: 'EMAIL_VERIFIED',
  };
  event.response.privateChallengeParameters = { expectedHmac };
  return event;
};
