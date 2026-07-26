/** Cognito custom auth session을 token·실패·재시도 상태로 분기한다 */

/** Define Auth Challenge handler가 사용하는 최소 Cognito event */
export interface DefineAuthChallengeEvent {
  request: {
    session: Array<{
      challengeName: string;
      challengeResult: boolean;
    }>;
  };
  response: {
    issueTokens: boolean;
    failAuthentication: boolean;
    challengeName?: 'CUSTOM_CHALLENGE';
  };
}

/** custom challenge 성공 1회 또는 실패 5회를 terminal 상태로 만든다 */
export const defineAuthChallenge = <T extends DefineAuthChallengeEvent>(
  event: T,
): T => {
  const customChallenges = event.request.session.filter(
    ({ challengeName }) => challengeName === 'CUSTOM_CHALLENGE',
  );
  if (customChallenges.some(({ challengeResult }) => challengeResult)) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    delete event.response.challengeName;
    return event;
  }
  if (
    customChallenges.filter(({ challengeResult }) => !challengeResult)
      .length >= 5
  ) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    delete event.response.challengeName;
    return event;
  }
  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = 'CUSTOM_CHALLENGE';
  return event;
};
