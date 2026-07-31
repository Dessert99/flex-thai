/** 관리자 문제 두 버전의 구조·내용 차이를 표시 단위로 분류한다 */
import type { AdminQuestionDetailResponse } from '@flex-thia/contracts';

type Version = AdminQuestionDetailResponse['versions'][number];

/** 문제 버전 비교 화면이 표시하는 안정된 차이 분류 */
export interface QuestionVersionDifference {
  kind: 'STATUS' | 'BODY' | 'OPTIONS' | 'CORRECT_ANSWER' | 'EXPLANATION';
  label: string;
  before: string;
  after: string;
}

const blockText = (version: Version, explanation: boolean) =>
  version.blocks
    .filter(({ kind }) => (kind === 'EXPLANATION') === explanation)
    .flatMap(({ sentences }) =>
      sentences.map(({ sentence }) => sentence.originalText),
    )
    .join('\n');

const optionText = (version: Version) =>
  version.options.map(({ displayText }) => displayText).join('\n');

const correctText = (version: Version) =>
  version.options.find(({ id }) => id === version.correctOptionId)
    ?.displayText ?? '';

/** 상태와 실제 문제 콘텐츠의 바뀐 항목만 stable 순서로 반환한다 */
export function compareQuestionVersions(
  before: Version,
  after: Version,
): QuestionVersionDifference[] {
  const candidates: QuestionVersionDifference[] = [
    {
      kind: 'STATUS',
      label: '상태',
      before: before.status,
      after: after.status,
    },
    {
      kind: 'BODY',
      label: '본문',
      before: blockText(before, false),
      after: blockText(after, false),
    },
    {
      kind: 'OPTIONS',
      label: '보기',
      before: optionText(before),
      after: optionText(after),
    },
    {
      kind: 'CORRECT_ANSWER',
      label: '정답',
      before: correctText(before),
      after: correctText(after),
    },
    {
      kind: 'EXPLANATION',
      label: '해설',
      before: blockText(before, true),
      after: blockText(after, true),
    },
  ];
  return candidates.filter(({ before: left, after: right }) => left !== right);
}
