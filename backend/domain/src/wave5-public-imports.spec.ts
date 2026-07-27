import {
  ContentTtsReadinessError,
  QuestionCandidateReviewError,
  QuestionCandidateReviewService,
  TtsDomainError,
  assertContentTtsReady,
  buildQuestionGenerationPrompt,
  classifyQuestionCandidate,
  createTtsCacheKey,
} from '@flex-thia/domain';
import type * as Domain from '@flex-thia/domain';
import { describe, expect, expectTypeOf, it } from 'vitest';

type Wave5DomainBoundary = [
  Domain.QuestionCandidateGroup,
  Domain.QuestionCandidateReviewStatus,
  Domain.QuestionValidationStage,
  Domain.GeneratedQuestionPayload,
  Domain.GeneratedQuestionCandidate,
  Domain.QuestionProductionCandidateRecord,
  Domain.QuestionProductionArtifacts,
  Domain.QuestionProductionContext,
  Domain.QuestionGenerationPrompt,
  Domain.QuestionGenerationProvider,
  Domain.QuestionCrossValidationProvider,
  Domain.QuestionProductionProviderRunRepository,
  Domain.QuestionProductionContextRepository,
  Domain.QuestionProductionCandidateRepository,
  Domain.QuestionSimilarityLookup,
  Domain.GeneratedQuestionDraftRepository,
  Domain.QuestionRegenerationDispatchWriter,
  Domain.TtsTargetKind,
  Domain.TtsItemStatus,
  Domain.TtsJobStatus,
  Domain.TtsJob,
  Domain.TtsItem,
  Domain.TtsWorkItem,
  Domain.TtsVoiceSnapshot,
  Domain.ContentTtsReadinessRepository,
  Domain.TtsProvider,
  Domain.TtsAudioStore,
  Domain.TtsTargetAttachmentRepository,
];

describe('Wave 5 domain 공개 import', () => {
  it('패키지 루트가 AI 문제와 TTS 모델·port를 공개한다', () => {
    expectTypeOf<Wave5DomainBoundary>().toBeArray();
    expect([
      ContentTtsReadinessError,
      QuestionCandidateReviewError,
      QuestionCandidateReviewService,
      TtsDomainError,
      assertContentTtsReady,
      buildQuestionGenerationPrompt,
      classifyQuestionCandidate,
      createTtsCacheKey,
    ]).not.toContain(undefined);
  });
});
