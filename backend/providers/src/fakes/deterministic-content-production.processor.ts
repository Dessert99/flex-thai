/** 실제 DB port를 사용해 비용 없는 콘텐츠 제작 후보를 생성한다 */

import type { VocabularyProductionArtifacts } from '@flex-thia/domain/content-production/ai-vocabulary-production';
import {
  evaluateVocabularyCandidate,
  readVocabularyProductionPolicy,
} from '@flex-thia/domain/content-production/ai-vocabulary-production';
import type { ContentProductionWorkItem } from '@flex-thia/domain/content-production/content-production-work-item';
import type { VocabularyProductionLookup } from '@flex-thia/domain/vocabulary/vocabulary-production-lookup';

/** local fake processor가 artifact를 만들 때 필요한 domain repository port 묶음 */
export interface DeterministicContentProductionProcessorDependencies {
  vocabularyLookup: VocabularyProductionLookup;
}

/** local fake processor의 항목 처리 결과 */
export interface DeterministicContentProductionOutcome {
  status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
  retryable: boolean;
  errorCode: string | null;
  result?: Record<string, unknown>;
  artifacts?: VocabularyProductionArtifacts;
}

/** sourceRef suffix로 비용 없는 성공·검토·실패 fixture를 생성한다 */
export class DeterministicContentProductionProcessor {
  readonly vocabularyLookup: VocabularyProductionLookup;

  constructor(
    dependencies: DeterministicContentProductionProcessorDependencies,
  ) {
    this.vocabularyLookup = dependencies.vocabularyLookup;
  }

  /** 같은 sourceRef에는 언제나 같은 항목 결과와 artifact를 반환한다 */
  async process(
    workItem: ContentProductionWorkItem,
    signal: AbortSignal,
  ): Promise<DeterministicContentProductionOutcome> {
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error('콘텐츠 제작 항목 처리가 취소되었습니다');
    }

    const { item } = workItem;
    if (
      item.sourceRef.endsWith(':fail') ||
      /^input:2(?::|$)/u.test(item.sourceRef)
    ) {
      return {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_FAKE_FAILURE',
      };
    }
    if (
      item.sourceRef.endsWith(':attention') ||
      /^input:1(?::|$)/u.test(item.sourceRef)
    ) {
      return {
        status: 'NEEDS_ATTENTION',
        retryable: false,
        errorCode: null,
        result: { reviewReason: 'LOCAL_FAKE_ATTENTION' },
      };
    }

    if (item.operation === 'VOCABULARY_EXTRACTION') {
      const evaluated = await evaluateVocabularyCandidate({
        candidate: {
          thai: 'ทดสอบระบบ',
          kind: 'EXPRESSION',
          meanings: [
            {
              meaningKo: '로컬 시스템 테스트',
              partOfSpeech: '표현',
              difficulty: 1,
            },
          ],
        },
        ordinal: 0,
        lookup: this.vocabularyLookup,
        policy: readVocabularyProductionPolicy(
          workItem.presetSnapshot.parameters,
        ),
      });
      const artifacts: VocabularyProductionArtifacts = {
        kind: 'VOCABULARY_CANDIDATES',
        candidates: [evaluated.candidate],
        validations: evaluated.validations,
      };
      return {
        status: 'SUCCEEDED',
        retryable: false,
        errorCode: null,
        result: { generatedCount: 1 },
        artifacts,
      };
    }

    throw new Error('Unsupported content production operation');
  }
}
