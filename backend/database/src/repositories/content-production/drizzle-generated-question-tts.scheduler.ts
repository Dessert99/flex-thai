/** 생성 문제 DRAFT의 문장 음성을 승인 transaction 안에서 예약한다 */
import { randomUUID } from 'node:crypto';
import { createTtsCacheKey, type TtsVoiceSnapshot } from '@flex-thia/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  questionBlockSentences,
  questionBlocks,
  questionOptions,
  questionVersions,
  thaiSentenceVersions,
  ttsItems,
  ttsJobs,
  ttsVoicePresets,
} from '../../schema/index.js';
import {
  createTtsInitialCommandFingerprint,
  type TtsDispatchOutboxWriter,
} from '../dispatch/drizzle-async-dispatch-outbox.repository.js';
import type {
  GeneratedQuestionTtsScheduler,
  QuestionProductionTransaction,
} from './drizzle-ai-question-production.repository.js';

const unavailablePreset = (): never => {
  throw new Error('GENERATED_QUESTION_TTS_PRESET_UNAVAILABLE');
};

const targetMismatch = (): never => {
  throw new Error('GENERATED_QUESTION_TTS_TARGET_MISMATCH');
};

const voiceSnapshot = (preset: {
  id: string;
  provider: string;
  model: string;
  voice: string;
  locale: string;
  audioFormat: string;
  generationRevision: string;
  enabled: boolean;
}): TtsVoiceSnapshot => {
  if (
    !preset.enabled ||
    preset.locale !== 'th-TH' ||
    preset.audioFormat !== 'audio/wav'
  ) {
    return unavailablePreset();
  }
  return {
    presetId: preset.id,
    provider: preset.provider,
    model: preset.model,
    voice: preset.voice,
    locale: preset.locale,
    audioFormat: preset.audioFormat,
    generationRevision: preset.generationRevision,
  };
};

/** 설정된 enabled preset과 graph 문장 snapshot으로 job·item·outbox를 함께 쓴다 */
export class DrizzleGeneratedQuestionTtsScheduler implements GeneratedQuestionTtsScheduler {
  constructor(
    private readonly voicePresetId: string,
    private readonly dispatchWriter: TtsDispatchOutboxWriter<QuestionProductionTransaction>,
    private readonly generateId: () => string = randomUUID,
  ) {}

  /** DRAFT와 null-media 문장을 잠근 뒤 attempt 0 실행 intent까지 기록한다 */
  async schedule(
    transaction: QuestionProductionTransaction,
    input: Parameters<GeneratedQuestionTtsScheduler['schedule']>[1],
  ): Promise<{ jobIds: string[] }> {
    const voicePolicy = input.voicePolicy ?? {
      defaultVoicePresetId: this.voicePresetId,
      speakerVoiceAssignments: [],
    };
    const presetIds = [
      ...new Set([
        voicePolicy.defaultVoicePresetId,
        ...voicePolicy.speakerVoiceAssignments.map(
          ({ voicePresetId }) => voicePresetId,
        ),
      ]),
    ].sort();
    const presetRows = await transaction
      .select({
        id: ttsVoicePresets.id,
        provider: ttsVoicePresets.provider,
        model: ttsVoicePresets.model,
        voice: ttsVoicePresets.voice,
        locale: ttsVoicePresets.locale,
        audioFormat: ttsVoicePresets.audioFormat,
        generationRevision: ttsVoicePresets.generationRevision,
        enabled: ttsVoicePresets.enabled,
      })
      .from(ttsVoicePresets)
      .where(
        and(
          inArray(ttsVoicePresets.id, presetIds),
          eq(ttsVoicePresets.enabled, true),
        ),
      )
      .for('share');
    if (presetRows.length !== presetIds.length) return unavailablePreset();
    const voices = new Map(
      presetRows.map((preset) => [preset.id, voiceSnapshot(preset)]),
    );

    const [version] = await transaction
      .select({
        id: questionVersions.id,
        questionId: questionVersions.questionId,
        status: questionVersions.status,
      })
      .from(questionVersions)
      .where(
        and(
          eq(questionVersions.id, input.draft.questionVersionId),
          eq(questionVersions.questionId, input.draft.questionId),
          eq(questionVersions.status, 'DRAFT'),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !version ||
      version.id !== input.draft.questionVersionId ||
      version.questionId !== input.draft.questionId ||
      version.status !== 'DRAFT'
    ) {
      return targetMismatch();
    }

    const blockRows = await transaction
      .select({
        sentenceVersionId: questionBlockSentences.sentenceVersionId,
        speaker: questionBlockSentences.speaker,
      })
      .from(questionBlockSentences)
      .innerJoin(
        questionBlocks,
        eq(questionBlockSentences.blockId, questionBlocks.id),
      )
      .where(
        eq(questionBlocks.questionVersionId, input.draft.questionVersionId),
      )
      .orderBy(asc(questionBlockSentences.sentenceVersionId));
    const optionRows = await transaction
      .select({
        sentenceVersionId: questionOptions.sentenceVersionId,
        spanSentenceVersionId: questionOptions.spanSentenceVersionId,
      })
      .from(questionOptions)
      .where(
        eq(questionOptions.questionVersionId, input.draft.questionVersionId),
      )
      .orderBy(asc(questionOptions.id));
    const rolesByTarget = new Map<string, string | null>();
    const assignTarget = (targetId: string, speaker: string | null) => {
      const role = speaker?.trim() || null;
      if (rolesByTarget.has(targetId) && rolesByTarget.get(targetId) !== role) {
        return targetMismatch();
      }
      rolesByTarget.set(targetId, role);
    };
    for (const { sentenceVersionId, speaker } of blockRows) {
      assignTarget(sentenceVersionId, speaker);
    }
    for (const { sentenceVersionId, spanSentenceVersionId } of optionRows) {
      if (sentenceVersionId !== null) assignTarget(sentenceVersionId, null);
      if (
        spanSentenceVersionId !== null &&
        !rolesByTarget.has(spanSentenceVersionId)
      ) {
        return targetMismatch();
      }
    }
    const targetIds = [...rolesByTarget.keys()].sort();
    if (targetIds.length === 0) return targetMismatch();

    const sentences = await transaction
      .select({
        id: thaiSentenceVersions.id,
        originalText: thaiSentenceVersions.originalText,
        mediaAssetId: thaiSentenceVersions.mediaAssetId,
        frozenAt: thaiSentenceVersions.frozenAt,
      })
      .from(thaiSentenceVersions)
      .where(inArray(thaiSentenceVersions.id, targetIds))
      .orderBy(asc(thaiSentenceVersions.id))
      .for('update');
    if (
      sentences.length !== targetIds.length ||
      sentences.some(
        (sentence, index) =>
          sentence.id !== targetIds[index] ||
          sentence.originalText.length === 0 ||
          sentence.mediaAssetId !== null ||
          sentence.frozenAt !== null,
      )
    ) {
      return targetMismatch();
    }

    const presetByRole = new Map(
      voicePolicy.speakerVoiceAssignments.map(
        ({ speakerRole, voicePresetId }) => [speakerRole.trim(), voicePresetId],
      ),
    );
    const groups = new Map<string, typeof sentences>();
    for (const sentence of sentences) {
      const role = rolesByTarget.get(sentence.id) ?? null;
      const presetId =
        (role === null ? undefined : presetByRole.get(role)) ??
        voicePolicy.defaultVoicePresetId;
      const group = groups.get(presetId) ?? [];
      group.push(sentence);
      groups.set(presetId, group);
    }

    const jobIds: string[] = [];
    for (const [presetId, groupedSentences] of [...groups.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const voice = voices.get(presetId);
      if (!voice) return unavailablePreset();
      const jobId = this.generateId();
      jobIds.push(jobId);
      const commandFingerprint = createTtsInitialCommandFingerprint(jobId);
      await transaction.insert(ttsJobs).values({
        id: jobId,
        requestedBy: input.requestedBy,
        voiceSnapshot: voice,
        dispatchAttempt: 0,
        lastDispatchCommandFingerprint: commandFingerprint,
        status: 'QUEUED',
        pendingCount: groupedSentences.length,
        processingCount: 0,
        succeededCount: 0,
        failedCount: 0,
        createdAt: input.requestedAt,
        updatedAt: input.requestedAt,
      });
      await transaction.insert(ttsItems).values(
        groupedSentences.map((sentence) => ({
          id: this.generateId(),
          jobId,
          targetKind: 'THAI_SENTENCE_VERSION' as const,
          targetId: sentence.id,
          targetText: sentence.originalText,
          targetRequired: true,
          revision: input.draft.questionVersionId,
          voiceSnapshot: voice,
          cacheKey: createTtsCacheKey(sentence.originalText, voice),
          status: 'PENDING' as const,
          attempt: 0,
          mediaAssetId: null,
          createdAt: input.requestedAt,
          updatedAt: input.requestedAt,
        })),
      );
      await this.dispatchWriter.enqueueTts(transaction, {
        jobId,
        attempt: 0,
        commandFingerprint,
        requestedAt: input.requestedAt,
      });
    }
    return { jobIds };
  }
}
