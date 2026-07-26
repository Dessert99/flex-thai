/** 콘텐츠 제작 work item을 비용 안전한 AI 어휘 후보 pipeline으로 처리한다 */
import {
  evaluateVocabularyCandidate,
  readVocabularyProductionPolicy,
  runVocabularyProviderOperation,
} from '@flex-thia/domain';
import type {
  ContentOcrProvider,
  ContentProductionInputReader,
  ContentProductionWorkItem,
  VocabularyCrossValidationProvider,
  VocabularyExtractionProvider,
  VocabularyProductionLookup,
  VocabularyProductionCandidateRecord,
  VocabularyProductionValidationRecord,
  VocabularyProviderExecution,
  VocabularyProviderRunRepository,
} from '@flex-thia/domain';
import type { ContentProductionItemOutcome } from './content-production-dispatcher.js';

const executionFor = (
  workItem: ContentProductionWorkItem,
  input: {
    operation: string;
    sequence: number;
    provider: string;
    model: string;
    promptVersion: string;
  },
): VocabularyProviderExecution => ({
  jobItemId: workItem.item.id,
  jobAttempt: workItem.jobAttempt,
  itemLeaseToken: workItem.item.leaseToken,
  ...input,
});

const providerFailureOutcome = (result: {
  status: 'FAILED' | 'OUTCOME_UNKNOWN';
  errorCode: string;
  retryable: boolean;
}): ContentProductionItemOutcome => ({
  status: result.status === 'OUTCOME_UNKNOWN' ? 'NEEDS_ATTENTION' : 'FAILED',
  retryable: result.retryable,
  errorCode: result.errorCode,
});

/** TEXT·PDF·IMAGE를 후보·규칙·독립 검증 결과로 변환한다 */
export class AiVocabularyProductionProcessor {
  constructor(
    private readonly inputReader: ContentProductionInputReader,
    private readonly ocrProvider: ContentOcrProvider,
    private readonly extractionProvider: VocabularyExtractionProvider,
    private readonly crossValidationProvider: VocabularyCrossValidationProvider,
    private readonly vocabularyLookup: VocabularyProductionLookup,
    private readonly providerRuns: VocabularyProviderRunRepository,
  ) {}

  /** 한 item의 후보들을 격리 처리하고 persistence artifact를 반환한다 */
  async process(
    workItem: ContentProductionWorkItem,
    signal: AbortSignal,
  ): Promise<ContentProductionItemOutcome> {
    let policy;

    try {
      policy = readVocabularyProductionPolicy(
        workItem.presetSnapshot.parameters,
      );
    } catch {
      return {
        status: 'FAILED',
        retryable: false,
        errorCode: 'INVALID_DUPLICATE_POLICY',
      };
    }

    let bytes: Uint8Array;

    try {
      bytes = await this.inputReader.read(workItem.input, signal);
    } catch {
      return {
        status: 'FAILED',
        retryable: true,
        errorCode: 'CONTENT_INPUT_READ_FAILED',
      };
    }

    let text: string;

    if (workItem.input.inputType === 'TEXT') {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return {
          status: 'FAILED',
          retryable: false,
          errorCode: 'CONTENT_TEXT_INVALID_UTF8',
        };
      }
    } else {
      const ocrInputType = workItem.input.inputType;
      const ocr = await runVocabularyProviderOperation(
        executionFor(workItem, {
          operation: 'OCR',
          sequence: 0,
          provider: 'CONTENT_OCR',
          model: 'configured',
          promptVersion: 'none',
        }),
        this.providerRuns,
        async () => ({
          kind: 'TEXT',
          ...(await this.ocrProvider.recognize({
            bytes,
            inputType: ocrInputType,
            signal,
          })),
        }),
      );

      if (ocr.status !== 'SUCCEEDED') {
        return providerFailureOutcome(ocr);
      }
      text = ocr.result.kind === 'TEXT' ? ocr.result.text : '';
    }

    const extraction = await runVocabularyProviderOperation(
      executionFor(workItem, {
        operation: 'VOCABULARY_EXTRACTION',
        sequence: 0,
        provider: 'VOCABULARY_AI',
        model: 'configured-extraction',
        promptVersion: 'vocabulary-extraction-v1',
      }),
      this.providerRuns,
      async () => ({
        kind: 'CANDIDATES',
        candidates: await this.extractionProvider.extract({
          text,
          preset: workItem.presetSnapshot,
          signal,
        }),
      }),
    );

    if (extraction.status !== 'SUCCEEDED') {
      return providerFailureOutcome(extraction);
    }
    const candidates =
      extraction.result.kind === 'CANDIDATES'
        ? extraction.result.candidates
        : [];

    if (candidates.length === 0) {
      return {
        status: 'NEEDS_ATTENTION',
        retryable: false,
        errorCode: 'NO_VOCABULARY_CANDIDATES',
        result: { total: 0, normal: 0, needsAttention: 0, failed: 0 },
      };
    }

    const records: VocabularyProductionCandidateRecord[] = [];
    const validations: VocabularyProductionValidationRecord[] = [];

    for (const [ordinal, candidate] of candidates.entries()) {
      const evaluated = await evaluateVocabularyCandidate({
        candidate,
        ordinal,
        lookup: this.vocabularyLookup,
        policy,
      });
      records.push(evaluated.candidate);
      validations.push(...evaluated.validations);

      if (evaluated.candidate.resultGroup === 'FAILED') {
        continue;
      }

      const crossValidation = await runVocabularyProviderOperation(
        executionFor(workItem, {
          operation: 'VOCABULARY_CROSS_VALIDATION',
          sequence: ordinal,
          provider: 'VOCABULARY_AI',
          model: 'configured-validation',
          promptVersion: 'vocabulary-validation-v1',
        }),
        this.providerRuns,
        async () => ({
          kind: 'VALIDATION',
          ...(await this.crossValidationProvider.validate({
            candidate: evaluated.candidate,
            preset: workItem.presetSnapshot,
            signal,
          })),
        }),
      );

      if (crossValidation.status !== 'SUCCEEDED') {
        return providerFailureOutcome(crossValidation);
      }

      const validation =
        crossValidation.result.kind === 'VALIDATION'
          ? crossValidation.result
          : {
              status: 'FAILED' as const,
              code: 'AI_VALIDATION_INVALID_RESULT',
            };
      validations.push({
        candidateOrdinal: ordinal,
        stage: 'AI_CROSS_VALIDATION',
        status: validation.status,
        code: validation.code,
        details: {},
      });

      if (validation.status === 'FAILED') {
        evaluated.candidate.resultGroup = 'NEEDS_ATTENTION';
        evaluated.candidate.reviewCode =
          validation.code ?? 'AI_VALIDATION_DISAGREEMENT';
      }
    }

    const counts = {
      total: records.length,
      normal: records.filter((candidate) => candidate.resultGroup === 'NORMAL')
        .length,
      needsAttention: records.filter(
        (candidate) => candidate.resultGroup === 'NEEDS_ATTENTION',
      ).length,
      failed: records.filter((candidate) => candidate.resultGroup === 'FAILED')
        .length,
    };
    const needsAttention = counts.needsAttention > 0 || counts.failed > 0;

    return {
      status: needsAttention ? 'NEEDS_ATTENTION' : 'SUCCEEDED',
      retryable: false,
      errorCode: null,
      result: counts,
      artifacts: {
        kind: 'VOCABULARY_CANDIDATES',
        candidates: records,
        validations,
      },
    };
  }
}
