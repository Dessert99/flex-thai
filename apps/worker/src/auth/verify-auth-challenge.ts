/** Cognito Verify trigger의 JSON answer를 domain 검증 use case로 전달한다 */
import type { VerifyAuthChallengeResponseTriggerEvent } from 'aws-lambda';
import type {
  ChallengeAnswerKind,
  VerifyChallengeAnswerService,
} from '@flex-thia/domain';

const parseAnswer = (
  value: string | null | undefined,
): { kind: ChallengeAnswerKind; answer: string } | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      kind?: unknown;
      answer?: unknown;
    };

    if (
      (parsed.kind !== 'CODE' && parsed.kind !== 'LINK') ||
      typeof parsed.answer !== 'string'
    ) {
      return null;
    }

    return { kind: parsed.kind, answer: parsed.answer };
  } catch {
    return null;
  }
};

/** malformed answer는 예외 대신 인증 실패로 종료한다 */
export const createVerifyAuthChallengeHandler =
  (verifier: Pick<VerifyChallengeAnswerService, 'execute'>) =>
  async (
    event: VerifyAuthChallengeResponseTriggerEvent,
  ): Promise<VerifyAuthChallengeResponseTriggerEvent> => {
    const challengeId = event.request.privateChallengeParameters.challengeId;
    const answer = parseAnswer(event.request.challengeAnswer);

    if (!challengeId || !answer) {
      event.response.answerCorrect = false;
      return event;
    }

    event.response.answerCorrect = await verifier.execute({
      challengeId,
      ...answer,
    });
    return event;
  };
