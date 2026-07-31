/** 관리자 문제 상세 preview·상태 테스트의 해석된 version fixture를 제공한다 */
/** 상세 fixture의 논리 문제 ID */
export const questionId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
/** 상세 fixture의 편집 가능한 DRAFT version ID */
export const draftVersionId = '01933b6a-8f13-7a19-b7e5-536d70f57aab';
/** 상세 fixture의 현재 게시 version ID */
export const publishedVersionId = '01933b6a-8f13-7a19-b7e5-536d70f57aac';

/** 게시 가능한 TTS readiness fixture를 만든다 */
export function createReadyReadiness() {
  return {
    ready: true,
    requiredCount: 1,
    readyCount: 1,
    blockers: [],
  };
}

/** 비교 가능한 DRAFT와 게시 version을 포함한 상세 fixture를 만든다 */
export function createQuestionDetail({
  draftValidationStatus = 'FAILED',
}: {
  draftValidationStatus?: 'FAILED' | 'PASSED';
} = {}) {
  return {
    questionId,
    status: 'PUBLISHED',
    currentPublishedVersionId: publishedVersionId,
    versions: [
      createVersion({
        id: draftVersionId,
        status: 'DRAFT',
        validation: {
          status: draftValidationStatus,
          issues:
            draftValidationStatus === 'FAILED'
              ? [
                  {
                    path: 'blocks.0.sentences.0',
                    code: 'MEDIA_ASSET_NOT_READY',
                  },
                ]
              : [],
          validatedAt: '2026-07-25T00:00:00.000Z',
        },
        version: 3,
      }),
      createVersion({
        id: publishedVersionId,
        status: 'PUBLISHED',
        validation: {
          status: 'PASSED',
          issues: [],
          validatedAt: '2026-07-24T00:00:00.000Z',
        },
        version: 2,
      }),
    ],
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
  };
}

function createVersion({
  id,
  status,
  validation,
  version,
}: {
  id: string;
  status: 'DRAFT' | 'PUBLISHED';
  validation: {
    status: 'FAILED' | 'PASSED';
    issues: Array<{ path: string; code: string }>;
    validatedAt: string;
  };
  version: number;
}) {
  const optionId = `${id.slice(0, -1)}d`;
  const sentenceId = `${id.slice(0, -1)}f`;
  const sentence = {
    id: sentenceId,
    originalText: version === 3 ? 'คำถามใหม่' : 'คำถามเดิม',
    translationKo: version === 3 ? '새 질문' : '이전 질문',
    pronunciationKo: '캄탐',
    toneMarks: 'M-M',
    mediaAssetId: questionId,
    audio: {
      status: 'READY',
      readUrl: 'https://media.example.com/question.wav',
    },
    tokens: [],
    expressions: [],
  } as const;
  return {
    id,
    version,
    status,
    validation,
    questionType: {
      id: `${id.slice(0, -1)}e`,
      slug: 'dialogue-choice',
      version: 1,
      skill: 'LISTENING',
      template: 'DIALOGUE_CHOICE',
    },
    difficulty: 4,
    topic: { id: questionId, slug: 'general', displayName: '일반' },
    tags: [],
    blocks: [
      {
        id: sentenceId,
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        position: 0,
        sentences: [
          {
            position: 0,
            speaker: null,
            sentenceVersionId: sentenceId,
            sentence,
          },
        ],
      },
      {
        id: `${id.slice(0, -1)}1`,
        kind: 'EXPLANATION',
        displayMode: 'TEXT',
        position: 1,
        sentences: [
          {
            position: 0,
            speaker: null,
            sentenceVersionId: sentenceId,
            sentence,
          },
        ],
      },
    ],
    options: [
      {
        id: optionId,
        position: 0,
        sentenceVersionId: sentenceId,
        span: null,
        displayText: sentence.originalText,
        sentence,
      },
    ],
    correctOptionId: optionId,
    createdAt: '2026-07-25T00:00:00.000Z',
    publishedAt: status === 'PUBLISHED' ? '2026-07-25T00:00:00.000Z' : null,
  };
}
