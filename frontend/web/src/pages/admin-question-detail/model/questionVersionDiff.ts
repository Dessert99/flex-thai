/** 관리자 문제 두 버전의 의미 있는 graph 차이를 안정된 projection으로 분류한다 */
import type { AdminQuestionDetailResponse } from '@flex-thia/contracts';

type Version = AdminQuestionDetailResponse['versions'][number];
type Sentence = Version['blocks'][number]['sentences'][number]['sentence'];

/** 문제 버전 비교 화면이 표시하는 안정된 차이 분류 */
export interface QuestionVersionDifference {
  kind:
    | 'STATUS'
    | 'METADATA'
    | 'BODY'
    | 'OPTIONS'
    | 'CORRECT_ANSWER'
    | 'EXPLANATION';
  label: string;
  before: string;
  after: string;
}

const comparePosition = (
  left: { position: number },
  right: { position: number },
) => left.position - right.position;

const stableText = (value: unknown) => JSON.stringify(value, null, 2);

const sentenceProjection = (sentence: Sentence) => ({
  originalText: sentence.originalText,
  translationKo: sentence.translationKo,
  pronunciationKo: sentence.pronunciationKo,
  toneMarks: sentence.toneMarks,
  mediaAssetId: sentence.mediaAssetId,
  audioStatus: sentence.audio.status,
  tokens: [...sentence.tokens].sort(comparePosition).map((token) => ({
    position: token.position,
    surface: token.surface,
    startOffset: token.startOffset,
    endOffset: token.endOffset,
    vocabularyId: token.vocabularyId,
    meaningId: token.meaningId,
    pronunciationId: token.pronunciationId,
    contextMeaningKo: token.contextMeaningKo,
    role: token.role,
  })),
  expressions: [...sentence.expressions]
    .sort(
      (left, right) =>
        left.startTokenIndex - right.startTokenIndex ||
        left.endTokenIndex - right.endTokenIndex,
    )
    .map((expression) => ({
      startTokenIndex: expression.startTokenIndex,
      endTokenIndex: expression.endTokenIndex,
      vocabularyId: expression.vocabularyId,
      meaningId: expression.meaningId,
      pronunciationId: expression.pronunciationId,
      contextMeaningKo: expression.contextMeaningKo,
      representative: expression.representative,
    })),
});

const blockProjection = (version: Version, explanation: boolean) =>
  [...version.blocks]
    .filter(({ kind }) => (kind === 'EXPLANATION') === explanation)
    .sort(comparePosition)
    .map((block) => ({
      position: block.position,
      kind: block.kind,
      displayMode: block.displayMode,
      sentences: [...block.sentences].sort(comparePosition).map((item) => ({
        position: item.position,
        speaker: item.speaker,
        sentence: sentenceProjection(item.sentence),
      })),
    }));

const metadataProjection = (version: Version) => ({
  questionType: {
    slug: version.questionType.slug,
    version: version.questionType.version,
    skill: version.questionType.skill,
    template: version.questionType.template,
  },
  difficulty: version.difficulty,
  topic: {
    slug: version.topic.slug,
    displayName: version.topic.displayName,
  },
  tags: version.tags
    .map(({ slug, displayName }) => ({ slug, displayName }))
    .sort((left, right) => left.slug.localeCompare(right.slug)),
});

const statusProjection = (version: Version) => ({
  status: version.status,
  validation: {
    status: version.validation.status,
    issues: [...version.validation.issues]
      .map(({ path, code }) => ({ path, code }))
      .sort(
        (left, right) =>
          left.path.localeCompare(right.path) ||
          left.code.localeCompare(right.code),
      ),
  },
});

const sentenceLocations = (version: Version) =>
  new Map(
    version.blocks.flatMap((block) =>
      block.sentences.map((item) => [
        item.sentenceVersionId,
        `${block.position}:${item.position}`,
      ]),
    ),
  );

const optionProjection = (version: Version) => {
  const locations = sentenceLocations(version);
  return [...version.options].sort(comparePosition).map((option) => ({
    position: option.position,
    displayText: option.displayText,
    sentence: sentenceProjection(option.sentence),
    span:
      option.span === null
        ? null
        : {
            target:
              locations.get(option.span.sentenceVersionId) ?? 'UNRESOLVED',
            startTokenIndex: option.span.startTokenIndex,
            endTokenIndex: option.span.endTokenIndex,
          },
  }));
};

const correctOptionProjection = (version: Version) => {
  const correct = version.options.find(
    ({ id }) => id === version.correctOptionId,
  );
  return correct
    ? { position: correct.position, displayText: correct.displayText }
    : null;
};

/** 상태·메타데이터와 문제 graph의 의미가 바뀐 항목만 stable 순서로 반환한다 */
export function compareQuestionVersions(
  before: Version,
  after: Version,
): QuestionVersionDifference[] {
  const candidates = [
    {
      kind: 'STATUS',
      label: '상태',
      before: stableText(statusProjection(before)),
      after: stableText(statusProjection(after)),
    },
    {
      kind: 'METADATA',
      label: '메타데이터',
      before: stableText(metadataProjection(before)),
      after: stableText(metadataProjection(after)),
    },
    {
      kind: 'BODY',
      label: '본문',
      before: stableText(blockProjection(before, false)),
      after: stableText(blockProjection(after, false)),
    },
    {
      kind: 'OPTIONS',
      label: '보기',
      before: stableText(optionProjection(before)),
      after: stableText(optionProjection(after)),
    },
    {
      kind: 'CORRECT_ANSWER',
      label: '정답',
      before: stableText(correctOptionProjection(before)),
      after: stableText(correctOptionProjection(after)),
    },
    {
      kind: 'EXPLANATION',
      label: '해설',
      before: stableText(blockProjection(before, true)),
      after: stableText(blockProjection(after, true)),
    },
  ] satisfies QuestionVersionDifference[];
  return candidates.filter(({ before: left, after: right }) => left !== right);
}
