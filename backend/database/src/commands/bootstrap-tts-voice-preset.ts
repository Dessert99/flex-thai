/** 운영 Aurora에 production TTS 음성 preset을 fail-fast bootstrap한다 */
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DataApiDatabaseConfig } from '../clients/data-api.js';
import {
  bootstrapTtsVoicePreset,
  DataApiTtsVoicePresetBootstrapStore,
  type ProductionTtsVoicePreset,
  type TtsVoicePresetDataApiClient,
} from '../operations/bootstrap-tts-voice-preset.js';

/** bootstrap command가 검증한 Data API 연결과 immutable preset 값 */
export interface BootstrapTtsVoicePresetEnv {
  connection: DataApiDatabaseConfig;
  preset: ProductionTtsVoicePreset;
}

/** command 종료 시 AWS SDK 연결을 정리할 Data API client */
export interface BootstrapTtsVoicePresetClient extends TtsVoicePresetDataApiClient {
  destroy(): void;
}

/** 환경 검증 뒤에만 Data API client를 만드는 주입 경계 */
export type BootstrapTtsVoicePresetClientFactory = (
  region: string,
) => BootstrapTtsVoicePresetClient;

const requireEnv = (
  source: Record<string, string | undefined>,
  name: string,
): string => {
  const value = source[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

/** production preset 여섯 값과 기존 Data API 네 값을 기본값 없이 읽는다 */
export const readBootstrapTtsVoicePresetEnv = (
  source: Record<string, string | undefined>,
): BootstrapTtsVoicePresetEnv => {
  const id = requireEnv(source, 'TTS_VOICE_PRESET_ID');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      id,
    )
  ) {
    throw new Error('Invalid environment variable: TTS_VOICE_PRESET_ID');
  }
  return {
    connection: {
      region: requireEnv(source, 'AWS_REGION'),
      database: requireEnv(source, 'DATABASE_NAME'),
      resourceArn: requireEnv(source, 'RDS_RESOURCE_ARN'),
      secretArn: requireEnv(source, 'RDS_SECRET_ARN'),
    },
    preset: {
      id,
      name: requireEnv(source, 'TTS_VOICE_PRESET_NAME'),
      provider: requireEnv(source, 'TTS_PROVIDER_NAME'),
      model: requireEnv(source, 'TTS_PROVIDER_MODEL'),
      voice: requireEnv(source, 'TTS_PROVIDER_VOICE'),
      locale: 'th-TH',
      audioFormat: 'audio/wav',
      generationRevision: requireEnv(source, 'TTS_GENERATION_REVISION'),
      enabled: true,
    },
  };
};

/** 모든 필수 값을 검증한 뒤 client를 열고 exact bootstrap 후 항상 정리한다 */
export const runBootstrapTtsVoicePresetCommand = async (
  source: Record<string, string | undefined> = process.env,
  createClient: BootstrapTtsVoicePresetClientFactory = (region) =>
    new RDSDataClient({ region }),
): Promise<void> => {
  const env = readBootstrapTtsVoicePresetEnv(source);
  const client = createClient(env.connection.region);
  try {
    await bootstrapTtsVoicePreset(
      new DataApiTtsVoicePresetBootstrapStore(client, env.connection),
      env.preset,
    );
  } finally {
    client.destroy();
  }
};

const commandPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (commandPath === import.meta.url) {
  try {
    await runBootstrapTtsVoicePresetCommand();
    console.info('운영 TTS 음성 preset bootstrap 완료');
  } catch (error) {
    console.error('운영 TTS 음성 preset bootstrap 실패:', error);
    process.exitCode = 1;
  }
}
