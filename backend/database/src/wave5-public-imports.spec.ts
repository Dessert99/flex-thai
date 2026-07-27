import {
  DrizzleAiQuestionProductionRepository,
  DrizzleQuestionProductionContextQuery,
  DrizzleTtsOperationsQuery,
  DrizzleTtsRepository,
  assembleQuestionProductionContext,
  questionCandidateGroupEnum,
  questionCandidatePayloadStateEnum,
  questionCandidateReviewStatusEnum,
  questionProductionCandidates,
  questionProductionValidationStatusEnum,
  questionProductionValidations,
  questionValidationStageEnum,
  readQuestionProductionPresetPolicy,
  ttsAudioCache,
  ttsAudioCacheStatusEnum,
  ttsAudioGenerationClaimTtlMs,
  ttsItemStatusEnum,
  ttsItems,
  ttsJobStatusEnum,
  ttsJobs,
  ttsTargetKindEnum,
  ttsVoicePresets,
} from '@flex-thia/database';
import type * as Database from '@flex-thia/database';
import { describe, expect, expectTypeOf, it } from 'vitest';

type Wave5DatabaseBoundary = [
  Database.QuestionProductionTransaction,
  Database.GeneratedQuestionDraftWriter,
  Database.QuestionProductionContextRows,
  Database.TtsRepositoryTransaction,
  Database.CompleteTtsAudioInput,
  Database.TtsAudioClaimFinalization,
  Database.CompleteTtsAudioResult,
  Database.FailTtsAudioResult,
  Database.TtsTargetAttachmentWriter,
  Database.TtsRepository,
  Database.TtsOperationsJobListInput,
  Database.TtsOperationsItemListInput,
  Database.TtsOperationsQuery,
];

describe('Wave 5 database 공개 import', () => {
  it('패키지 루트가 schema·query·repository를 공개한다', () => {
    expectTypeOf<Wave5DatabaseBoundary>().toBeArray();
    expect([
      DrizzleAiQuestionProductionRepository,
      DrizzleQuestionProductionContextQuery,
      DrizzleTtsOperationsQuery,
      DrizzleTtsRepository,
      assembleQuestionProductionContext,
      questionCandidateGroupEnum,
      questionCandidatePayloadStateEnum,
      questionCandidateReviewStatusEnum,
      questionProductionCandidates,
      questionProductionValidationStatusEnum,
      questionProductionValidations,
      questionValidationStageEnum,
      readQuestionProductionPresetPolicy,
      ttsAudioCache,
      ttsAudioCacheStatusEnum,
      ttsAudioGenerationClaimTtlMs,
      ttsItemStatusEnum,
      ttsItems,
      ttsJobStatusEnum,
      ttsJobs,
      ttsTargetKindEnum,
      ttsVoicePresets,
    ]).not.toContain(undefined);
  });
});
