/** 문제 버전 TTS 재생성의 소유권·멱등·중복 실행 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  decideQuestionTtsRegeneration,
  QuestionTtsRegenerationError,
} from './question-tts-regeneration.js';

const questionId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const actor = {
  actorUserId: '00000000-0000-4000-8000-000000000003',
  actorSub: 'admin-sub',
  requestId: 'request-1',
};

const input = {
  questionId,
  versionId,
  actor,
  version: { id: versionId, questionId, status: 'DRAFT' as const },
  replay: null,
  activeJobIds: [],
};

describe('문제 버전 TTS 재생성 결정', () => {
  it('소유권이 일치하는 DRAFT에 새 schedule을 허용한다', () => {
    expect(decideQuestionTtsRegeneration(input)).toEqual({
      kind: 'SCHEDULE',
    });
  });
});

describe('문제 버전 TTS 재생성 replay', () => {
  it('같은 actor와 request ID의 완료 기록은 같은 결과로 replay한다', () => {
    const result = {
      jobIds: ['00000000-0000-4000-8000-000000000004'],
      scheduledSentenceCount: 1,
      reusedReadySentenceCount: 2,
    };

    expect(
      decideQuestionTtsRegeneration({
        ...input,
        replay: { ...actor, questionId, versionId, result },
        activeJobIds: result.jobIds,
      }),
    ).toEqual({ kind: 'REPLAY', result });
  });

  it.each([
    { name: 'version 조회 결과가 없어도', version: null },
    {
      name: 'version이 PUBLISHED여도',
      version: { ...input.version, status: 'PUBLISHED' as const },
    },
    {
      name: 'version이 INVALIDATED여도',
      version: { ...input.version, status: 'INVALIDATED' as const },
    },
  ])('exact replay는 $name 원래 결과를 반환한다', ({ version }) => {
    const result = {
      jobIds: ['00000000-0000-4000-8000-000000000004'],
      scheduledSentenceCount: 1,
      reusedReadySentenceCount: 2,
    };

    expect(
      decideQuestionTtsRegeneration({
        ...input,
        replay: { ...actor, questionId, versionId, result },
        version,
      }),
    ).toEqual({ kind: 'REPLAY', result });
  });
});

describe('문제 버전 TTS 재생성 오류', () => {
  it.each([
    {
      name: '문제가 없을 때',
      input: { ...input, version: null },
      code: 'QUESTION_TTS_VERSION_NOT_FOUND',
    },
    {
      name: '다른 문제 버전일 때',
      input: {
        ...input,
        version: { ...input.version, questionId: crypto.randomUUID() },
      },
      code: 'QUESTION_TTS_VERSION_NOT_FOUND',
    },
    {
      name: '불변 버전일 때',
      input: {
        ...input,
        version: { ...input.version, status: 'PUBLISHED' as const },
      },
      code: 'QUESTION_TTS_IMMUTABLE_VERSION',
    },
    {
      name: '다른 요청이 실행 중일 때',
      input: { ...input, activeJobIds: [crypto.randomUUID()] },
      code: 'QUESTION_TTS_ALREADY_RUNNING',
    },
    {
      name: 'request ID가 다른 명령에 사용됐을 때',
      input: {
        ...input,
        replay: {
          ...actor,
          actorSub: 'other-admin',
          questionId,
          versionId,
          result: {
            jobIds: [],
            scheduledSentenceCount: 0,
            reusedReadySentenceCount: 1,
          },
        },
      },
      code: 'QUESTION_TTS_IDEMPOTENCY_CONFLICT',
    },
    {
      name: 'request ID가 다른 version에 사용됐을 때',
      input: {
        ...input,
        replay: {
          ...actor,
          questionId,
          versionId: crypto.randomUUID(),
          result: {
            jobIds: [],
            scheduledSentenceCount: 0,
            reusedReadySentenceCount: 1,
          },
        },
      },
      code: 'QUESTION_TTS_IDEMPOTENCY_CONFLICT',
    },
    {
      name: 'version 조회 결과 없이 request ID가 다른 명령에 사용됐을 때',
      input: {
        ...input,
        version: null,
        replay: {
          ...actor,
          actorSub: 'other-admin',
          questionId,
          versionId,
          result: {
            jobIds: [],
            scheduledSentenceCount: 0,
            reusedReadySentenceCount: 1,
          },
        },
      },
      code: 'QUESTION_TTS_IDEMPOTENCY_CONFLICT',
    },
  ] satisfies Array<{
    name: string;
    input: Parameters<typeof decideQuestionTtsRegeneration>[0];
    code: ConstructorParameters<typeof QuestionTtsRegenerationError>[0];
  }>)('$name stable 오류를 반환한다', ({ input: candidate, code }) => {
    expect(() => decideQuestionTtsRegeneration(candidate)).toThrow(
      new QuestionTtsRegenerationError(code),
    );
  });
});
