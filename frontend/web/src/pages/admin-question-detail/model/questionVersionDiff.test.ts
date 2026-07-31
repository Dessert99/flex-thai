/** 문제 버전의 의미 있는 graph diff와 내부 식별자 잡음 제거를 검증한다 */
import { describe, expect, it } from 'vitest';
import { compareQuestionVersions } from './questionVersionDiff';

describe('문제 버전 비교', () => {
  it('본문·보기·정답·해설·상태 차이를 독립 항목으로 반환한다', () => {
    const before = version();
    const after = structuredClone(before);
    const bodyBlock = required(
      after.blocks.find(({ position }) => position === 0),
      '본문 block이 필요합니다.',
    );
    const explanationBlock = required(
      after.blocks.find(({ position }) => position === 1),
      '해설 block이 필요합니다.',
    );
    const bodySentence = required(
      bodyBlock.sentences.find(({ position }) => position === 0),
      '본문 문장이 필요합니다.',
    );
    const explanationSentence = required(
      explanationBlock.sentences.find(({ position }) => position === 0),
      '해설 문장이 필요합니다.',
    );
    const firstOption = required(
      after.options.find(({ position }) => position === 0),
      '첫 번째 보기가 필요합니다.',
    );
    const secondOption = required(
      after.options.find(({ position }) => position === 1),
      '두 번째 보기가 필요합니다.',
    );
    after.status = 'PUBLISHED';
    bodySentence.sentence.originalText = '질문 변경';
    explanationSentence.sentence.translationKo = '해설 변경';
    firstOption.displayText = '보기 변경';
    after.correctOptionId = secondOption.id;

    expect(
      compareQuestionVersions(before as never, after as never).map(
        ({ kind }) => kind,
      ),
    ).toEqual(['STATUS', 'BODY', 'OPTIONS', 'CORRECT_ANSWER', 'EXPLANATION']);
  });
});

describe('문제 버전 학습 정보 비교', () => {
  it('유형·표시 모드·화자·문장 학습 정보·audio·option 의미 변경을 찾는다', () => {
    const before = version();
    const after = structuredClone(before);
    const bodyBlock = required(
      after.blocks.find(({ position }) => position === 0),
      '본문 block이 필요합니다.',
    );
    const bodyItem = required(
      bodyBlock.sentences.find(({ position }) => position === 0),
      '본문 문장이 필요합니다.',
    );
    const token = required(
      bodyItem.sentence.tokens.find(({ position }) => position === 0),
      '본문 token이 필요합니다.',
    );
    const expression = required(
      bodyItem.sentence.expressions[0],
      '본문 expression이 필요합니다.',
    );
    const firstOption = required(
      after.options.find(({ position }) => position === 0),
      '첫 번째 보기가 필요합니다.',
    );
    after.questionType.skill = 'LISTENING';
    after.difficulty = 5;
    after.tags.push({
      id: '00000000-0000-4000-8000-000000000031',
      slug: 'listening',
      displayName: '듣기',
    });
    bodyBlock.displayMode = 'AUDIO_THEN_REVEAL';
    bodyItem.speaker = 'B';
    const bodySentence = bodyItem.sentence;
    bodySentence.pronunciationKo = '새 발음';
    bodySentence.toneMarks = 'H';
    bodySentence.mediaAssetId = '00000000-0000-4000-8000-000000000032';
    bodySentence.audio.status = 'FAILED';
    bodySentence.audio.readUrl = null;
    token.contextMeaningKo = '새 문맥';
    expression.representative = false;
    firstOption.sentence.translationKo = '새 보기 번역';

    expect(
      compareQuestionVersions(before as never, after as never).map(
        ({ kind }) => kind,
      ),
    ).toEqual(['METADATA', 'BODY', 'OPTIONS']);
  });
});

describe('문제 버전 내부 식별자 비교', () => {
  it('내부 UUID·서명 URL과 position이 같은 배열 순서 변경은 무시한다', () => {
    const before = version();
    const after = structuredClone(before);
    after.id = '00000000-0000-4000-8000-000000000040';
    after.questionType.id = '00000000-0000-4000-8000-000000000041';
    after.topic.id = '00000000-0000-4000-8000-000000000042';
    required(after.tags[0], 'tag가 필요합니다.').id =
      '00000000-0000-4000-8000-000000000043';
    after.blocks.reverse();
    after.blocks.forEach((block, blockIndex) => {
      block.id = `00000000-0000-4000-8000-00000000004${blockIndex + 4}`;
      block.sentences.forEach((item, sentenceIndex) => {
        item.sentenceVersionId = `00000000-0000-4000-8000-00000000005${blockIndex + sentenceIndex}`;
        item.sentence.id = `00000000-0000-4000-8000-00000000006${blockIndex + sentenceIndex}`;
        if (item.sentence.audio.status === 'READY') {
          item.sentence.audio.readUrl = `https://media.example.com/signed-${blockIndex}.wav`;
        }
      });
    });
    after.options.reverse();
    const correct = required(
      after.options.find(({ position }) => position === 0),
      '정답 보기가 필요합니다.',
    );
    const wrong = required(
      after.options.find(({ position }) => position === 1),
      '오답 보기가 필요합니다.',
    );
    correct.id = '00000000-0000-4000-8000-000000000070';
    wrong.id = '00000000-0000-4000-8000-000000000071';
    after.correctOptionId = correct.id;

    expect(compareQuestionVersions(before as never, after as never)).toEqual(
      [],
    );
  });
});

function version() {
  const sentence = resolvedSentence(
    '00000000-0000-4000-8000-000000000010',
    'คำถาม',
    '질문',
  );
  const explanation = resolvedSentence(
    '00000000-0000-4000-8000-000000000011',
    'คำอธิบาย',
    '해설',
  );
  const firstOption = resolvedSentence(
    '00000000-0000-4000-8000-000000000012',
    'ตัวเลือกหนึ่ง',
    '보기 하나',
  );
  const secondOption = resolvedSentence(
    '00000000-0000-4000-8000-000000000013',
    'ตัวเลือกสอง',
    '보기 둘',
  );
  return {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    status: 'DRAFT',
    validation: { status: 'PENDING', issues: [], validatedAt: null },
    questionType: {
      id: '00000000-0000-4000-8000-000000000002',
      slug: 'reading-choice',
      version: 1,
      skill: 'READING',
      template: 'STANDARD_CHOICE',
    },
    difficulty: 2,
    topic: {
      id: '00000000-0000-4000-8000-000000000003',
      slug: 'general',
      displayName: '일반',
    },
    tags: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        slug: 'greeting',
        displayName: '인사',
      },
    ],
    blocks: [
      {
        id: '00000000-0000-4000-8000-000000000005',
        kind: 'QUESTION',
        displayMode: 'TEXT_AND_AUDIO',
        position: 0,
        sentences: [
          {
            position: 0,
            speaker: 'A',
            sentenceVersionId: sentence.id,
            sentence,
          },
        ],
      },
      {
        id: '00000000-0000-4000-8000-000000000006',
        kind: 'EXPLANATION',
        displayMode: 'TEXT',
        position: 1,
        sentences: [
          {
            position: 0,
            speaker: null,
            sentenceVersionId: explanation.id,
            sentence: explanation,
          },
        ],
      },
    ],
    options: [
      {
        id: '00000000-0000-4000-8000-000000000007',
        position: 0,
        sentenceVersionId: firstOption.id,
        span: null,
        displayText: firstOption.originalText,
        sentence: firstOption,
      },
      {
        id: '00000000-0000-4000-8000-000000000008',
        position: 1,
        sentenceVersionId: secondOption.id,
        span: null,
        displayText: secondOption.originalText,
        sentence: secondOption,
      },
    ],
    correctOptionId: '00000000-0000-4000-8000-000000000007',
    createdAt: '2026-07-31T00:00:00.000Z',
    publishedAt: null,
  };
}

function resolvedSentence(
  id: string,
  originalText: string,
  translationKo: string,
) {
  return {
    id,
    originalText,
    translationKo,
    pronunciationKo: '발음',
    toneMarks: 'M',
    mediaAssetId: '00000000-0000-4000-8000-000000000020',
    audio: {
      status: 'READY',
      readUrl: 'https://media.example.com/signed.wav' as string | null,
    },
    tokens: [
      {
        position: 0,
        surface: originalText,
        startOffset: 0,
        endOffset: Array.from(originalText).length,
        vocabularyId: '00000000-0000-4000-8000-000000000021',
        meaningId: '00000000-0000-4000-8000-000000000022',
        pronunciationId: '00000000-0000-4000-8000-000000000023',
        contextMeaningKo: translationKo,
        role: 'TARGET',
      },
    ],
    expressions: [
      {
        startTokenIndex: 0,
        endTokenIndex: 1,
        vocabularyId: '00000000-0000-4000-8000-000000000024',
        meaningId: '00000000-0000-4000-8000-000000000025',
        pronunciationId: '00000000-0000-4000-8000-000000000026',
        contextMeaningKo: translationKo,
        representative: true,
      },
    ],
  };
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
