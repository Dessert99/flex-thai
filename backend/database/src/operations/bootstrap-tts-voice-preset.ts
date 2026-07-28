/** 운영 TTS 음성 preset을 Data API로 생성하고 불변 replay를 검증한다 */
import {
  ExecuteStatementCommand,
  type ExecuteStatementCommandOutput,
} from '@aws-sdk/client-rds-data';
import type { DataApiDatabaseConfig } from '../clients/data-api.js';

/** 운영 traffic 전에 DB에 고정할 enabled TTS 음성 preset */
export interface ProductionTtsVoicePreset {
  id: string;
  name: string;
  provider: string;
  model: string;
  voice: string;
  locale: 'th-TH';
  audioFormat: 'audio/wav';
  generationRevision: string;
  enabled: true;
}

/** immutable preset 생성과 identity 충돌 조회를 분리한 저장 경계 */
export interface TtsVoicePresetBootstrapStore {
  createIfAbsent(input: ProductionTtsVoicePreset): Promise<void>;
  findByIdentity(
    input: ProductionTtsVoicePreset,
  ): Promise<ProductionTtsVoicePreset[]>;
}

/** bootstrap이 사용하는 최소 Aurora Data API 실행 경계 */
export interface TtsVoicePresetDataApiClient {
  send(
    command: ExecuteStatementCommand,
  ): Promise<ExecuteStatementCommandOutput>;
}

const immutablePresetMatches = (
  actual: ProductionTtsVoicePreset,
  expected: ProductionTtsVoicePreset,
): boolean =>
  actual.id === expected.id &&
  actual.name === expected.name &&
  actual.provider === expected.provider &&
  actual.model === expected.model &&
  actual.voice === expected.voice &&
  actual.locale === expected.locale &&
  actual.audioFormat === expected.audioFormat &&
  actual.generationRevision === expected.generationRevision &&
  actual.enabled === expected.enabled;

const parameter = (name: string, value: string) => ({
  name,
  value: { stringValue: value },
});

const parsePresetRows = (formattedRecords: string | undefined) => {
  if (!formattedRecords) return [];
  const records: unknown = JSON.parse(formattedRecords);
  if (!Array.isArray(records)) {
    throw new Error('TTS_VOICE_PRESET_DATA_API_RESULT_INVALID');
  }
  return records as ProductionTtsVoicePreset[];
};

/** INSERT DO NOTHING과 후속 조회로 concurrent replay도 현재 committed row와 대조한다 */
export class DataApiTtsVoicePresetBootstrapStore implements TtsVoicePresetBootstrapStore {
  constructor(
    private readonly client: TtsVoicePresetDataApiClient,
    private readonly connection: DataApiDatabaseConfig,
  ) {}

  /** unique identity를 침범하지 않을 때만 enabled preset을 새로 만든다 */
  async createIfAbsent(input: ProductionTtsVoicePreset): Promise<void> {
    await this.client.send(
      new ExecuteStatementCommand({
        resourceArn: this.connection.resourceArn,
        secretArn: this.connection.secretArn,
        database: this.connection.database,
        sql: `INSERT INTO tts_voice_presets (
  id, name, provider, model, voice, locale, audio_format,
  generation_revision, enabled
) VALUES (
  CAST(:id AS uuid), :name, :provider, :model, :voice, :locale, :audioFormat,
  :generationRevision, true
)
ON CONFLICT DO NOTHING`,
        parameters: [
          parameter('id', input.id),
          parameter('name', input.name),
          parameter('provider', input.provider),
          parameter('model', input.model),
          parameter('voice', input.voice),
          parameter('locale', input.locale),
          parameter('audioFormat', input.audioFormat),
          parameter('generationRevision', input.generationRevision),
        ],
      }),
    );
  }

  /** UUID 또는 이름·revision identity가 겹치는 모든 row를 immutable 비교용으로 읽는다 */
  async findByIdentity(
    input: ProductionTtsVoicePreset,
  ): Promise<ProductionTtsVoicePreset[]> {
    const result = await this.client.send(
      new ExecuteStatementCommand({
        resourceArn: this.connection.resourceArn,
        secretArn: this.connection.secretArn,
        database: this.connection.database,
        formatRecordsAs: 'JSON',
        sql: `SELECT
  id::text AS "id",
  name,
  provider,
  model,
  voice,
  locale,
  audio_format AS "audioFormat",
  generation_revision AS "generationRevision",
  enabled
FROM tts_voice_presets
WHERE id = CAST(:id AS uuid)
   OR (name = :name AND generation_revision = :generationRevision)
ORDER BY id`,
        parameters: [
          parameter('id', input.id),
          parameter('name', input.name),
          parameter('generationRevision', input.generationRevision),
        ],
      }),
    );
    return parsePresetRows(result.formattedRecords);
  }
}

/** 새 row 또는 exact replay만 성공시키고 모든 identity 충돌은 무수정 거절한다 */
export const bootstrapTtsVoicePreset = async (
  store: TtsVoicePresetBootstrapStore,
  input: ProductionTtsVoicePreset,
): Promise<void> => {
  await store.createIfAbsent(input);
  const rows = await store.findByIdentity(input);
  if (rows.length !== 1 || !immutablePresetMatches(rows[0]!, input)) {
    throw new Error('TTS_VOICE_PRESET_IMMUTABLE_CONFLICT');
  }
};
