/** immutable TTS voice preset version과 관리자 감사를 한 transaction에 저장한다 */
import {
  TtsDomainError,
  type TtsOperationAuditContext,
  type TtsVoicePresetVersion,
} from '@flex-thia/domain';
import { eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from '../../schema/index.js';
import { auditLogs } from '../../schema/identity.schema.js';
import { ttsVoicePresets } from '../../schema/tts.schema.js';

type TtsVoicePresetDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type PresetConfiguration = Pick<
  TtsVoicePresetVersion,
  | 'provider'
  | 'model'
  | 'voice'
  | 'locale'
  | 'audioFormat'
  | 'generationRevision'
  | 'enabled'
>;

interface PresetCommandBase {
  id: string;
  context: TtsOperationAuditContext;
  occurredAt: Date;
}

/** 최초 TTS voice preset row 생성 입력 */
export interface CreateInitialTtsVoicePresetInput
  extends PresetCommandBase, PresetConfiguration {
  name: string;
}

/** 기존 이름을 유지하는 새 TTS voice preset version 입력 */
export interface CreateTtsVoicePresetVersionInput
  extends PresetCommandBase, PresetConfiguration {
  sourcePresetId: string;
  expectedUpdatedAt: Date;
}

/** TTS voice preset enabled optimistic 변경 입력 */
export interface SetTtsVoicePresetEnabledInput {
  presetId: string;
  expectedUpdatedAt: Date;
  enabled: boolean;
  context: TtsOperationAuditContext;
  occurredAt: Date;
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';

const toPreset = (
  row: typeof ttsVoicePresets.$inferSelect,
): TtsVoicePresetVersion => ({
  ...row,
  locale: 'th-TH',
  audioFormat: 'audio/wav',
});

/** TTS voice preset command의 row version과 append-only 감사를 원자적으로 쓴다 */
export class DrizzleTtsVoicePresetRepository {
  constructor(private readonly database: TtsVoicePresetDatabase) {}

  /** 이름을 포함한 최초 preset version을 생성한다 */
  async createInitial(
    input: CreateInitialTtsVoicePresetInput,
  ): Promise<TtsVoicePresetVersion> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [created] = await transaction
          .insert(ttsVoicePresets)
          .values({
            id: input.id,
            name: input.name,
            provider: input.provider,
            model: input.model,
            voice: input.voice,
            locale: input.locale,
            audioFormat: input.audioFormat,
            generationRevision: input.generationRevision,
            enabled: input.enabled,
            createdAt: input.occurredAt,
            updatedAt: input.occurredAt,
          })
          .returning();
        await this.appendAudit(transaction, input, 'TTS_VOICE_PRESET_CREATED');
        return toPreset(created!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TtsDomainError('TTS_VOICE_PRESET_VERSION_CONFLICT');
      }
      throw error;
    }
  }

  /** source row는 잠근 채 수정하지 않고 같은 이름의 새 version을 추가한다 */
  async createVersion(
    input: CreateTtsVoicePresetVersionInput,
  ): Promise<TtsVoicePresetVersion> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [source] = await transaction
          .select()
          .from(ttsVoicePresets)
          .where(eq(ttsVoicePresets.id, input.sourcePresetId))
          .for('update')
          .limit(1);
        if (!source) throw new TtsDomainError('TTS_VOICE_PRESET_NOT_FOUND');
        this.assertRevision(source.updatedAt, input.expectedUpdatedAt);
        const [created] = await transaction
          .insert(ttsVoicePresets)
          .values({
            id: input.id,
            name: source.name,
            provider: input.provider,
            model: input.model,
            voice: input.voice,
            locale: input.locale,
            audioFormat: input.audioFormat,
            generationRevision: input.generationRevision,
            enabled: input.enabled,
            createdAt: input.occurredAt,
            updatedAt: input.occurredAt,
          })
          .returning();
        await this.appendAudit(
          transaction,
          input,
          'TTS_VOICE_PRESET_VERSION_CREATED',
        );
        return toPreset(created!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TtsDomainError('TTS_VOICE_PRESET_VERSION_CONFLICT');
      }
      throw error;
    }
  }

  /** enabled와 updatedAt만 변경하고 같은 transaction에 감사를 남긴다 */
  async setEnabled(
    input: SetTtsVoicePresetEnabledInput,
  ): Promise<TtsVoicePresetVersion> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(ttsVoicePresets)
        .where(eq(ttsVoicePresets.id, input.presetId))
        .for('update')
        .limit(1);
      if (!current) throw new TtsDomainError('TTS_VOICE_PRESET_NOT_FOUND');
      this.assertRevision(current.updatedAt, input.expectedUpdatedAt);
      const [updated] = await transaction
        .update(ttsVoicePresets)
        .set({ enabled: input.enabled, updatedAt: input.occurredAt })
        .where(eq(ttsVoicePresets.id, input.presetId))
        .returning();
      await this.appendAudit(
        transaction,
        { ...input, id: input.presetId },
        input.enabled
          ? 'TTS_VOICE_PRESET_ENABLED'
          : 'TTS_VOICE_PRESET_DISABLED',
      );
      return toPreset(updated!);
    });
  }

  private assertRevision(current: Date, expected: Date): void {
    if (current.getTime() !== expected.getTime()) {
      throw new TtsDomainError('TTS_VOICE_PRESET_STALE_REVISION');
    }
  }

  private async appendAudit(
    transaction: Parameters<
      Parameters<TtsVoicePresetDatabase['transaction']>[0]
    >[0],
    input: PresetCommandBase,
    action: string,
  ): Promise<void> {
    await transaction.insert(auditLogs).values({
      actorSub: input.context.actorSub,
      actorUserId: input.context.actorUserId,
      action,
      target: input.id,
      targetType: 'TTS_VOICE_PRESET',
      targetId: input.id,
      requestId: input.context.requestId,
      summary: {},
      createdAt: input.occurredAt,
    });
  }
}
