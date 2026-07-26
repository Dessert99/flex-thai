/** AI 어휘 제작의 공급자 port와 후보 검증·중복 분류 규칙 */
import { normalizeThaiSearchText } from '../vocabulary/normalize-thai-search-text.js';
import type {
  VocabularyProductionLookup,
  VocabularyProductionMatch,
  VocabularyProductionSuspect,
} from '../vocabulary/vocabulary-production-lookup.js';
import type { ContentProductionPresetSnapshot } from './content-production.service.js';
import type { ContentProductionWorkItem } from './content-production-work-item.js';

/** AI가 제안하는 어휘 뜻 */
export interface ExtractedVocabularyMeaning {
  meaningKo: string;
  partOfSpeech: string;
  difficulty: number;
}

/** AI가 제안하는 구조화된 어휘 후보 */
export interface ExtractedVocabularyCandidate {
  thai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: ExtractedVocabularyMeaning[];
}

/** 어휘 후보의 기존 데이터 비교 결과 */
export type VocabularyDuplicateClassification =
  | 'NEW_VOCABULARY'
  | 'EXACT_EXISTING_MEANING'
  | 'EXACT_NEW_MEANING'
  | 'POSSIBLE_DUPLICATE';

/** 후보 검토 우선순위를 나타내는 내부 그룹 */
export type VocabularyCandidateResultGroup =
  'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';

/** 후보 검증 단계 */
export type VocabularyValidationStage =
  'SCHEMA' | 'DECISION_RULE' | 'AI_CROSS_VALIDATION';

/** preset에서 고정되는 의심 중복 정책 */
export interface VocabularyProductionPolicy {
  suspectedDuplicateMaxCodePointDistance: number;
}

/** 저장할 어휘 후보 snapshot */
export interface VocabularyProductionCandidateRecord {
  ordinal: number;
  thai: string;
  normalizedThai: string;
  kind: 'WORD' | 'EXPRESSION';
  meanings: ExtractedVocabularyMeaning[];
  classification: VocabularyDuplicateClassification;
  resultGroup: VocabularyCandidateResultGroup;
  matchedVocabularyId: string | null;
  suspectedMatches: VocabularyProductionSuspect[];
  reviewCode: string | null;
}

/** 후보별 검증 결과 */
export interface VocabularyProductionValidationRecord {
  candidateOrdinal: number;
  stage: VocabularyValidationStage;
  status: 'PASSED' | 'FAILED';
  code: string | null;
  details: Record<string, unknown>;
}

/** processor가 lease 아래 원자 저장할 내부 산출물 */
export interface VocabularyProductionArtifacts {
  kind: 'VOCABULARY_CANDIDATES';
  candidates: VocabularyProductionCandidateRecord[];
  validations: VocabularyProductionValidationRecord[];
}

/** 검증된 입력 bytes를 worker에 제공하는 port */
export interface ContentProductionInputReader {
  read(
    input: ContentProductionWorkItem['input'],
    signal: AbortSignal,
  ): Promise<Uint8Array>;
}

/** PDF·IMAGE를 text로 바꾸는 OCR port */
export interface ContentOcrProvider {
  recognize(input: {
    bytes: Uint8Array;
    inputType: 'PDF' | 'IMAGE';
    signal: AbortSignal;
  }): Promise<{ text: string }>;
}

/** text에서 구조화된 어휘 후보를 추출하는 AI port */
export interface VocabularyExtractionProvider {
  extract(input: {
    text: string;
    preset: ContentProductionPresetSnapshot;
    signal: AbortSignal;
  }): Promise<ExtractedVocabularyCandidate[]>;
}

/** 결정 규칙과 분리된 AI 교차 검증 port */
export interface VocabularyCrossValidationProvider {
  validate(input: {
    candidate: VocabularyProductionCandidateRecord;
    preset: ContentProductionPresetSnapshot;
    signal: AbortSignal;
  }): Promise<{ status: 'PASSED' | 'FAILED'; code: string | null }>;
}

/** 한 provider 호출을 중복 없이 식별하는 실행 key */
export interface VocabularyProviderExecution {
  jobItemId: string;
  jobAttempt: number;
  operation: string;
  sequence: number;
  provider: string;
  model: string;
  promptVersion: string;
  itemLeaseToken: string;
}

/** replay 가능한 provider 정규화 결과 */
export type VocabularyProviderNormalizedResult =
  | { kind: 'TEXT'; text: string }
  | { kind: 'CANDIDATES'; candidates: ExtractedVocabularyCandidate[] }
  | {
      kind: 'VALIDATION';
      status: 'PASSED' | 'FAILED';
      code: string | null;
    };

/** provider 실행의 terminal 실패 */
export interface VocabularyProviderFailure {
  status: 'FAILED' | 'OUTCOME_UNKNOWN';
  errorCode: string;
  retryable: boolean;
}

/** provider 재호출 여부를 transaction claim으로 결정하는 저장 port */
export interface VocabularyProviderRunRepository {
  claim(
    execution: VocabularyProviderExecution,
  ): Promise<
    | { kind: 'CLAIMED'; runId: string }
    | { kind: 'REPLAY'; result: VocabularyProviderNormalizedResult }
    | { kind: 'OUTCOME_UNKNOWN' }
  >;
  succeed(
    runId: string,
    result: VocabularyProviderNormalizedResult,
  ): Promise<boolean>;
  fail(runId: string, failure: VocabularyProviderFailure): Promise<boolean>;
}

/** provider 오류의 retry 가능성과 응답 수신 확실성을 보존한다 */
export class VocabularyProviderCallError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly outcomeKnown: boolean,
  ) {
    super(code);
    this.name = 'VocabularyProviderCallError';
  }
}

/** claim을 획득한 경우에만 provider를 호출하고 terminal 결과를 재사용한다 */
export const runVocabularyProviderOperation = async (
  execution: VocabularyProviderExecution,
  repository: VocabularyProviderRunRepository,
  call: () => Promise<VocabularyProviderNormalizedResult>,
): Promise<
  | { status: 'SUCCEEDED'; result: VocabularyProviderNormalizedResult }
  | ({ status: 'FAILED' | 'OUTCOME_UNKNOWN' } & Omit<
      VocabularyProviderFailure,
      'status'
    >)
> => {
  const claim = await repository.claim(execution);

  if (claim.kind === 'REPLAY') {
    return { status: 'SUCCEEDED', result: claim.result };
  }

  if (claim.kind === 'OUTCOME_UNKNOWN') {
    return {
      status: 'OUTCOME_UNKNOWN',
      errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      retryable: true,
    };
  }

  try {
    const result = await call();
    await repository.succeed(claim.runId, result);
    return { status: 'SUCCEEDED', result };
  } catch (error) {
    const failure: VocabularyProviderFailure =
      error instanceof VocabularyProviderCallError && !error.outcomeKnown
        ? {
            status: 'OUTCOME_UNKNOWN',
            errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
            retryable: true,
          }
        : {
            status: 'FAILED',
            errorCode:
              error instanceof VocabularyProviderCallError
                ? error.code
                : 'PROVIDER_CALL_FAILED',
            retryable:
              error instanceof VocabularyProviderCallError
                ? error.retryable
                : true,
          };
    await repository.fail(claim.runId, failure);
    return failure;
  }
};

/** preset snapshot의 의심 중복 정책을 검증한다 */
export const readVocabularyProductionPolicy = (
  parameters: Record<string, unknown>,
): VocabularyProductionPolicy => {
  const distance = parameters.suspectedDuplicateMaxCodePointDistance;

  if (
    !Number.isInteger(distance) ||
    typeof distance !== 'number' ||
    distance < 0 ||
    distance > 3
  ) {
    throw new Error('INVALID_DUPLICATE_POLICY');
  }

  return { suspectedDuplicateMaxCodePointDistance: distance };
};

const normalizeMeaning = (value: string): string =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

const validateSchema = (
  candidate: ExtractedVocabularyCandidate,
): string | null => {
  if (!normalizeThaiSearchText(candidate.thai)) {
    return 'VOCABULARY_THAI_REQUIRED';
  }

  if (!['WORD', 'EXPRESSION'].includes(candidate.kind)) {
    return 'VOCABULARY_KIND_INVALID';
  }

  if (candidate.meanings.length === 0) {
    return 'VOCABULARY_MEANING_REQUIRED';
  }

  if (
    candidate.meanings.some(
      (meaning) =>
        !normalizeMeaning(meaning.meaningKo) ||
        !meaning.partOfSpeech.trim() ||
        !Number.isInteger(meaning.difficulty) ||
        meaning.difficulty < 1 ||
        meaning.difficulty > 5,
    )
  ) {
    return 'VOCABULARY_MEANING_INVALID';
  }

  return null;
};

const hasExistingMeaning = (
  candidate: ExtractedVocabularyCandidate,
  exact: VocabularyProductionMatch,
): boolean => {
  const existing = new Set(
    exact.meanings.map((meaning) => normalizeMeaning(meaning.meaningKo)),
  );
  return candidate.meanings.some((meaning) =>
    existing.has(normalizeMeaning(meaning.meaningKo)),
  );
};

/** 후보 한 개를 schema 검증 뒤 exact·의심 중복으로 분류한다 */
export const evaluateVocabularyCandidate = async (input: {
  candidate: ExtractedVocabularyCandidate;
  ordinal: number;
  lookup: VocabularyProductionLookup;
  policy: VocabularyProductionPolicy;
}): Promise<{
  candidate: VocabularyProductionCandidateRecord;
  validations: VocabularyProductionValidationRecord[];
}> => {
  const schemaCode = validateSchema(input.candidate);
  const normalizedThai = normalizeThaiSearchText(input.candidate.thai);

  if (schemaCode) {
    return {
      candidate: {
        ordinal: input.ordinal,
        thai: input.candidate.thai,
        normalizedThai,
        kind: input.candidate.kind,
        meanings: input.candidate.meanings,
        classification: 'NEW_VOCABULARY',
        resultGroup: 'FAILED',
        matchedVocabularyId: null,
        suspectedMatches: [],
        reviewCode: schemaCode,
      },
      validations: [
        {
          candidateOrdinal: input.ordinal,
          stage: 'SCHEMA',
          status: 'FAILED',
          code: schemaCode,
          details: {},
        },
      ],
    };
  }

  const exact = await input.lookup.findExact(normalizedThai);
  const suspected = exact
    ? []
    : (
        await input.lookup.findSuspected({
          normalizedThai,
          maxCodePointDistance:
            input.policy.suspectedDuplicateMaxCodePointDistance,
          limit: 5,
        })
      )
        .sort(
          (left, right) =>
            left.codePointDistance - right.codePointDistance ||
            left.vocabularyId.localeCompare(right.vocabularyId),
        )
        .slice(0, 5);
  const classification = exact
    ? hasExistingMeaning(input.candidate, exact)
      ? 'EXACT_EXISTING_MEANING'
      : 'EXACT_NEW_MEANING'
    : suspected.length > 0
      ? 'POSSIBLE_DUPLICATE'
      : 'NEW_VOCABULARY';
  const needsAttention =
    classification === 'EXACT_EXISTING_MEANING' ||
    classification === 'POSSIBLE_DUPLICATE';

  return {
    candidate: {
      ordinal: input.ordinal,
      thai: input.candidate.thai,
      normalizedThai,
      kind: input.candidate.kind,
      meanings: input.candidate.meanings.map((meaning) => ({
        ...meaning,
        meaningKo: normalizeMeaning(meaning.meaningKo),
        partOfSpeech: meaning.partOfSpeech.trim(),
      })),
      classification,
      resultGroup: needsAttention ? 'NEEDS_ATTENTION' : 'NORMAL',
      matchedVocabularyId: exact?.vocabularyId ?? null,
      suspectedMatches: suspected,
      reviewCode: needsAttention ? classification : null,
    },
    validations: [
      {
        candidateOrdinal: input.ordinal,
        stage: 'SCHEMA',
        status: 'PASSED',
        code: null,
        details: {},
      },
      {
        candidateOrdinal: input.ordinal,
        stage: 'DECISION_RULE',
        status: 'PASSED',
        code: null,
        details: { classification },
      },
    ],
  };
};

export type {
  VocabularyProductionLookup,
  VocabularyProductionMatch,
  VocabularyProductionSuspect,
};
