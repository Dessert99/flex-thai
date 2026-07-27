/** 문제 분류 설정의 불변 버전과 taxonomy 저장 port를 정의한다 */
import type {
  QuestionBlockKind,
  QuestionDisplayMode,
  QuestionTemplate,
} from './question-version.js';

interface ApprovedExampleReference {
  id: string;
}

interface ApprovedExampleToken {
  surface: string;
  startOffset: number;
  endOffset: number;
  vocabulary: ApprovedExampleReference;
  meaning: ApprovedExampleReference;
  pronunciation: ApprovedExampleReference;
  contextMeaningKo: string;
  role: 'TARGET' | 'REQUIRED' | 'SUPPORTING' | 'INSTRUCTION';
}

interface ApprovedExampleExpression {
  startTokenIndex: number;
  endTokenIndex: number;
  vocabulary: ApprovedExampleReference;
  meaning: ApprovedExampleReference;
  pronunciation: ApprovedExampleReference;
  contextMeaningKo: string;
  representative?: boolean | undefined;
}

interface ApprovedExampleSentence {
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  toneMarks: string;
  mediaAssetId: string;
  tokens: ApprovedExampleToken[];
  expressions: ApprovedExampleExpression[];
}

interface ApprovedExampleBlock {
  kind: QuestionBlockKind;
  displayMode: QuestionDisplayMode;
  sentences: Array<{
    speaker?: string | null | undefined;
    sentence: ApprovedExampleSentence;
  }>;
}

type ApprovedExampleOption =
  | {
      clientRef: string;
      position: number;
      sentence: ApprovedExampleSentence;
      span: null;
    }
  | {
      clientRef: string;
      position: number;
      sentence: null;
      span: {
        blockPosition: number;
        sentencePosition: number;
        startTokenIndex: number;
        endTokenIndex: number;
      };
    };

/** FLEX 시험의 고정 7대 문제 분류 */
export type QuestionMajorCategory =
  | 'LISTENING_RESPONSE'
  | 'LISTENING_DIALOGUE'
  | 'LISTENING_PASSAGE'
  | 'READING_VOCABULARY_GRAMMAR'
  | 'READING_SYNONYM_RELATION'
  | 'READING_ERROR_IDENTIFICATION'
  | 'READING_PASSAGE';

/** 문제 유형 버전의 불변 lifecycle */
export type QuestionTypeVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

/** 유형 버전별 1~5 난이도 기준 */
export interface QuestionDifficultyCriterion {
  difficulty: number;
  criteria: string;
}

/** DB 참조 없이 보존하는 canonical 승인 예시 snapshot */
export interface QuestionApprovedExampleSnapshot {
  id?: string;
  title: string;
  payloadHash: string;
  payload: {
    questionTypeSlug: string;
    questionTypeVersion: number;
    difficulty: number;
    options: ApprovedExampleOption[];
    correctOptionRef: string;
    blocks: ApprovedExampleBlock[];
    [key: string]: unknown;
  };
}

/** 관리자 설정에서 조회하는 세부 유형 버전 */
export interface QuestionTypeVersionRecord {
  id: string;
  questionTypeId: string;
  questionTypeSlug: string;
  version: number;
  status: QuestionTypeVersionStatus;
  template: QuestionTemplate;
  optionCount: 3 | 4;
  decisionRules: Record<string, unknown>;
  difficultyCriteria: QuestionDifficultyCriterion[];
  approvedExamples: QuestionApprovedExampleSnapshot[];
}

/** 새 세부 유형의 논리 정보 */
export interface CreateQuestionTypeInput {
  slug: string;
  displayName: string;
  majorCategory: QuestionMajorCategory;
  skill: 'READING' | 'LISTENING';
}

/** 새 유형 버전의 불변 설정 */
export interface CreateQuestionTypeVersionInput {
  template: QuestionTemplate;
  optionCount: 3 | 4;
  decisionRules: Record<string, unknown>;
}

/** 주제·태그 설정 종류 */
export type QuestionTaxonomyTermKind = 'TOPIC' | 'TAG';

/** DRAFT 전용 변경이 transaction 잠금 뒤 확인한 결과 */
export type QuestionTypeDraftMutationResult =
  'UPDATED' | 'NOT_FOUND' | 'IMMUTABLE';

/** 유형 버전 활성화가 transaction 잠금 뒤 확인한 결과 */
export type QuestionTypeActivationResult =
  'ACTIVATED' | 'NOT_FOUND' | 'IMMUTABLE' | 'NOT_READY';

/** 문제 분류 설정의 원자 저장 계약 */
export interface QuestionTaxonomyRepository {
  createQuestionTypeWithDraft(input: CreateQuestionTypeInput): Promise<unknown>;
  createNextDraft(
    questionTypeId: string,
    input: CreateQuestionTypeVersionInput,
  ): Promise<unknown>;
  findVersion(versionId: string): Promise<QuestionTypeVersionRecord | null>;
  replaceDifficultyCriteria(
    versionId: string,
    criteria: QuestionDifficultyCriterion[],
  ): Promise<QuestionTypeDraftMutationResult>;
  addApprovedExample(
    versionId: string,
    example: QuestionApprovedExampleSnapshot,
  ): Promise<QuestionTypeDraftMutationResult>;
  removeApprovedExample(
    versionId: string,
    exampleId: string,
  ): Promise<QuestionTypeDraftMutationResult>;
  activateVersion(versionId: string): Promise<QuestionTypeActivationResult>;
  retireVersion(versionId: string): Promise<void>;
  createTerm(
    kind: QuestionTaxonomyTermKind,
    input: { slug: string; displayName: string },
  ): Promise<unknown>;
  archiveTerm(kind: QuestionTaxonomyTermKind, termId: string): Promise<void>;
}
