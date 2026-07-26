/** 개념 초안의 구조와 참조를 결정적으로 검증한다 */

/** 개념 검증 문제 */
export interface ConceptValidationIssue {
  source: 'STRUCTURE' | 'REFERENCE' | 'EXTERNAL';
  path: string;
  code: string;
  evidenceKo: string;
}

/** 개념 영역 */
export type ConceptCategory = 'THAI_SCRIPT_PRONUNCIATION' | 'GRAMMAR';
/** 개념 버전 상태 */
export type ConceptVersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
/** 개념 검증 상태 */
export type ConceptValidationStatus = 'PENDING' | 'PASSED' | 'FAILED';
/** 참조 음성 자산 상태 */
type ConceptMediaAssetStatus = 'UPLOADING' | 'READY' | 'REJECTED' | null;

/** 설명 블록 */
export interface ConceptExplanationBlock {
  kind: 'EXPLANATION';
  position: number;
  heading: string;
  paragraphs: string[];
}

/** 규칙 표 블록 */
export interface ConceptRuleTableBlock {
  kind: 'RULE_TABLE';
  position: number;
  heading: string;
  headers: string[];
  rows: string[][];
}

/** 개념 초안의 기존 문장 버전 입력 */
export interface ConceptExampleInput {
  position: number;
  sentenceVersionId: string;
  noteKo: string | null;
}

/** 검증 후보의 해석된 기존 문장 버전 참조 */
export interface ConceptExampleReference extends ConceptExampleInput {
  sentenceExists: boolean;
  audioAssetExists: boolean;
  audioAssetStatus: ConceptMediaAssetStatus;
  interactionIssues: ConceptInteractionReferenceIssue[];
}

/** 태국어 문장의 token/expression 피드백 참조 문제 */
export interface ConceptInteractionReferenceIssue {
  kind: 'TOKEN' | 'EXPRESSION';
  index: number;
  referenceValid: boolean;
  audioAssetExists: boolean;
  audioAssetStatus: ConceptMediaAssetStatus;
}

/** 태국어 예시 블록 */
export interface ConceptExamplesBlock {
  kind: 'THAI_EXAMPLES';
  position: number;
  heading: string;
  examples: ConceptExampleReference[];
}

/** 관리자 초안 입력의 태국어 예시 블록 */
export interface ConceptExamplesInputBlock {
  kind: 'THAI_EXAMPLES';
  position: number;
  heading: string;
  examples: ConceptExampleInput[];
}

/** 관리자 초안 전체 교체에 사용하는 블록 */
export type ConceptDraftBlock =
  ConceptExplanationBlock | ConceptRuleTableBlock | ConceptExamplesInputBlock;

/** 검증 가능한 개념 블록 */
export type ConceptCandidateBlock =
  ConceptExplanationBlock | ConceptRuleTableBlock | ConceptExamplesBlock;

/** 검증할 개념 초안 snapshot */
export interface ConceptValidationCandidate {
  id: string;
  conceptId: string;
  revision: number;
  status: ConceptVersionStatus;
  validationStatus: ConceptValidationStatus;
  validatedRevision: number | null;
  category: ConceptCategory;
  position: number;
  title: string;
  summary: string;
  blocks: ConceptCandidateBlock[];
}

const issue = (
  source: ConceptValidationIssue['source'],
  path: string,
  code: string,
  evidenceKo: string,
): ConceptValidationIssue => ({ source, path, code, evidenceKo });

const validatePositions = (
  values: Array<{ position: number }>,
  path: string,
  code: string,
): ConceptValidationIssue[] =>
  values.flatMap((value, index) =>
    value.position === index
      ? []
      : [
          issue(
            'STRUCTURE',
            `${path}.${index}.position`,
            code,
            '순서는 0부터 끊김 없이 이어져야 합니다.',
          ),
        ],
  );

/** 개념 초안의 구조와 기존 문장·음성 참조를 검증한다 */
export const validateConceptCandidate = (
  candidate: ConceptValidationCandidate,
): ConceptValidationIssue[] => {
  const issues: ConceptValidationIssue[] = [];
  if (!candidate.title.trim()) {
    issues.push(
      issue(
        'STRUCTURE',
        'title',
        'CONCEPT_TITLE_REQUIRED',
        '제목이 필요합니다.',
      ),
    );
  }
  if (!candidate.summary.trim()) {
    issues.push(
      issue(
        'STRUCTURE',
        'summary',
        'CONCEPT_SUMMARY_REQUIRED',
        '요약이 필요합니다.',
      ),
    );
  }
  issues.push(
    ...validatePositions(
      candidate.blocks,
      'blocks',
      'CONCEPT_BLOCK_POSITION_GAP',
    ),
  );
  candidate.blocks.forEach((block, blockIndex) => {
    const blockPath = `blocks.${blockIndex}`;
    if (!block.heading.trim()) {
      issues.push(
        issue(
          'STRUCTURE',
          `${blockPath}.heading`,
          'CONCEPT_BLOCK_HEADING_REQUIRED',
          '블록 제목이 필요합니다.',
        ),
      );
    }
    if (
      block.kind === 'EXPLANATION' &&
      (block.paragraphs.length === 0 ||
        block.paragraphs.some((paragraph) => !paragraph.trim()))
    ) {
      issues.push(
        issue(
          'STRUCTURE',
          `${blockPath}.paragraphs`,
          'CONCEPT_PARAGRAPH_REQUIRED',
          '비어 있지 않은 설명 문단이 필요합니다.',
        ),
      );
    }
    if (block.kind === 'RULE_TABLE') {
      if (block.headers.length === 0 || block.rows.length === 0) {
        issues.push(
          issue(
            'STRUCTURE',
            blockPath,
            'CONCEPT_RULE_TABLE_REQUIRED',
            '헤더와 행이 필요합니다.',
          ),
        );
      }
      block.rows.forEach((row, rowIndex) => {
        if (row.length !== block.headers.length) {
          issues.push(
            issue(
              'STRUCTURE',
              `${blockPath}.rows.${rowIndex}`,
              'CONCEPT_RULE_COLUMN_MISMATCH',
              '행의 열 수는 헤더와 같아야 합니다.',
            ),
          );
        }
      });
    }
    if (block.kind === 'THAI_EXAMPLES') {
      issues.push(
        ...validatePositions(
          block.examples,
          `${blockPath}.examples`,
          'CONCEPT_EXAMPLE_POSITION_GAP',
        ),
      );
      if (block.examples.length === 0) {
        issues.push(
          issue(
            'STRUCTURE',
            `${blockPath}.examples`,
            'CONCEPT_EXAMPLE_REQUIRED',
            '태국어 예시가 필요합니다.',
          ),
        );
      }
      const seen = new Set<string>();
      block.examples.forEach((example, exampleIndex) => {
        const examplePath = `${blockPath}.examples.${exampleIndex}`;
        if (seen.has(example.sentenceVersionId)) {
          issues.push(
            issue(
              'STRUCTURE',
              `${examplePath}.sentenceVersionId`,
              'CONCEPT_DUPLICATE_SENTENCE',
              '같은 블록에서 문장 버전을 중복 사용할 수 없습니다.',
            ),
          );
        }
        seen.add(example.sentenceVersionId);
        if (!example.sentenceExists) {
          issues.push(
            issue(
              'REFERENCE',
              `${examplePath}.sentenceVersionId`,
              'CONCEPT_SENTENCE_NOT_FOUND',
              '문장 버전을 찾을 수 없습니다.',
            ),
          );
        } else if (!example.audioAssetExists) {
          issues.push(
            issue(
              'REFERENCE',
              `${examplePath}.sentenceVersionId`,
              'CONCEPT_AUDIO_NOT_FOUND',
              '문장 음성을 찾을 수 없습니다.',
            ),
          );
        } else if (example.audioAssetStatus !== 'READY') {
          issues.push(
            issue(
              'REFERENCE',
              `${examplePath}.sentenceVersionId`,
              'CONCEPT_AUDIO_NOT_READY',
              '문장 음성이 아직 준비되지 않았습니다.',
            ),
          );
        }
        example.interactionIssues.forEach((interaction) => {
          const interactionPath = `${examplePath}.${interaction.kind === 'TOKEN' ? 'tokens' : 'expressions'}.${interaction.index}`;
          if (!interaction.referenceValid) {
            issues.push(
              issue(
                'REFERENCE',
                interactionPath,
                'CONCEPT_FEEDBACK_REFERENCE_NOT_FOUND',
                '단어·표현의 뜻 또는 발음 참조를 찾을 수 없습니다.',
              ),
            );
          } else if (!interaction.audioAssetExists) {
            issues.push(
              issue(
                'REFERENCE',
                interactionPath,
                'CONCEPT_FEEDBACK_AUDIO_NOT_FOUND',
                '단어·표현의 발음 음성을 찾을 수 없습니다.',
              ),
            );
          } else if (interaction.audioAssetStatus !== 'READY') {
            issues.push(
              issue(
                'REFERENCE',
                interactionPath,
                'CONCEPT_FEEDBACK_AUDIO_NOT_READY',
                '단어·표현의 발음 음성이 아직 준비되지 않았습니다.',
              ),
            );
          }
        });
      });
    }
  });
  return issues;
};
