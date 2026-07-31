/** 관리자 TTS voice preset catalog를 안전한 page projection으로 조회한다 */
import type { TtsVoicePresetVersion } from '@flex-thia/domain';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from '../schema/index.js';
import { ttsVoicePresets } from '../schema/tts.schema.js';

type TtsVoicePresetDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** TTS voice preset 목록 조건 */
export interface TtsVoicePresetListInput {
  query?: string;
  enabled?: boolean;
  page: number;
  pageSize: number;
}

/** TTS voice preset stable page */
export interface TtsVoicePresetPage {
  items: TtsVoicePresetVersion[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

const presetSelection = {
  id: ttsVoicePresets.id,
  name: ttsVoicePresets.name,
  provider: ttsVoicePresets.provider,
  model: ttsVoicePresets.model,
  voice: ttsVoicePresets.voice,
  locale: ttsVoicePresets.locale,
  audioFormat: ttsVoicePresets.audioFormat,
  generationRevision: ttsVoicePresets.generationRevision,
  enabled: ttsVoicePresets.enabled,
  createdAt: ttsVoicePresets.createdAt,
  updatedAt: ttsVoicePresets.updatedAt,
};

const toPreset = (
  row: typeof ttsVoicePresets.$inferSelect,
): TtsVoicePresetVersion => ({
  ...row,
  locale: 'th-TH',
  audioFormat: 'audio/wav',
});

/** TTS voice preset 목록·상세를 job/provider 실행 정보 없이 조회한다 */
export class DrizzleTtsVoicePresetQuery {
  constructor(private readonly database: TtsVoicePresetDatabase) {}

  /** 검색·enabled 조건에 맞는 최신 preset version page를 반환한다 */
  async list(input: TtsVoicePresetListInput): Promise<TtsVoicePresetPage> {
    const escapedQuery = input.query
      ?.replaceAll('%', '\\%')
      .replaceAll('_', '\\_');
    const condition = and(
      escapedQuery
        ? or(
            ilike(ttsVoicePresets.name, `%${escapedQuery}%`),
            ilike(ttsVoicePresets.provider, `%${escapedQuery}%`),
            ilike(ttsVoicePresets.model, `%${escapedQuery}%`),
            ilike(ttsVoicePresets.voice, `%${escapedQuery}%`),
          )
        : undefined,
      input.enabled === undefined
        ? undefined
        : eq(ttsVoicePresets.enabled, input.enabled),
    );
    const [{ totalItems = 0 } = {}] = await this.database
      .select({ totalItems: count(ttsVoicePresets.id) })
      .from(ttsVoicePresets)
      .where(condition);
    const rows = await this.database
      .select(presetSelection)
      .from(ttsVoicePresets)
      .where(condition)
      .orderBy(desc(ttsVoicePresets.createdAt), desc(ttsVoicePresets.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    return {
      items: rows.map((row) => toPreset(row)),
      page: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    };
  }

  /** UUID에 해당하는 preset version을 반환한다 */
  async findById(id: string): Promise<TtsVoicePresetVersion | null> {
    const [row] = await this.database
      .select(presetSelection)
      .from(ttsVoicePresets)
      .where(eq(ttsVoicePresets.id, id))
      .limit(1);
    return row ? toPreset(row) : null;
  }
}
