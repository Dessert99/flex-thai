/** Cognito custom auth session 이력으로 다음 challenge 상태를 결정한다 */
import type { DefineAuthChallengeTriggerEvent } from 'aws-lambda';

/** 성공 시 token을 발급하고 최대 다섯 번만 custom challenge를 허용한다 */
export const applyDefineAuthChallenge = (
  event: DefineAuthChallengeTriggerEvent,
): DefineAuthChallengeTriggerEvent => {
  const session = event.request.session ?? [];
  const lastAttempt = session.at(-1);

  if (
    lastAttempt?.challengeName === 'CUSTOM_CHALLENGE' &&
    lastAttempt.challengeResult
  ) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    return event;
  }

  if (session.length >= 5) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = 'CUSTOM_CHALLENGE';
  return event;
};

/** Cognito DefineAuthChallenge trigger entrypoint */
export const handler = applyDefineAuthChallenge;
