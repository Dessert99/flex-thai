/** 운영 TTS 음성 preset bootstrap의 fail-fast·멱등·불변 충돌을 검증한다 */
import {
  type ExecuteStatementCommand,
  type ExecuteStatementCommandOutput,
} from '@aws-sdk/client-rds-data';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bootstrapTtsVoicePreset,
  DataApiTtsVoicePresetBootstrapStore,
  type ProductionTtsVoicePreset,
  type TtsVoicePresetBootstrapStore,
} from '../operations/bootstrap-tts-voice-preset.js';
import {
  readBootstrapTtsVoicePresetEnv,
  runBootstrapTtsVoicePresetCommand,
} from './bootstrap-tts-voice-preset.js';

const preset: ProductionTtsVoicePreset = {
  id: '00000000-0000-4000-8000-000000000777',
  name: 'production-thai-standard',
  provider: 'PRODUCTION_TTS',
  model: 'thai-neural-v1',
  voice: 'th-TH-standard-a',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: '2026-07-28',
  enabled: true,
};

const source = {
  AWS_REGION: 'ap-northeast-2',
  DATABASE_NAME: 'flex_thia',
  RDS_RESOURCE_ARN: 'arn:aws:rds:ap-northeast-2:123:cluster:flex-thia',
  RDS_SECRET_ARN: 'arn:aws:secretsmanager:ap-northeast-2:123:secret:db',
  TTS_VOICE_PRESET_ID: preset.id,
  TTS_VOICE_PRESET_NAME: preset.name,
  TTS_PROVIDER_NAME: preset.provider,
  TTS_PROVIDER_MODEL: preset.model,
  TTS_PROVIDER_VOICE: preset.voice,
  TTS_GENERATION_REVISION: preset.generationRevision,
};

class InMemoryVoicePresetStore implements TtsVoicePresetBootstrapStore {
  readonly rows: ProductionTtsVoicePreset[];

  constructor(rows: ProductionTtsVoicePreset[] = []) {
    this.rows = rows.map((row) => ({ ...row }));
  }

  createIfAbsent(input: ProductionTtsVoicePreset): Promise<void> {
    const conflict = this.rows.some(
      (row) =>
        row.id === input.id ||
        (row.name === input.name &&
          row.generationRevision === input.generationRevision),
    );
    if (!conflict) this.rows.push({ ...input });
    return Promise.resolve();
  }

  findByIdentity(
    input: ProductionTtsVoicePreset,
  ): Promise<ProductionTtsVoicePreset[]> {
    return Promise.resolve(
      this.rows
        .filter(
          (row) =>
            row.id === input.id ||
            (row.name === input.name &&
              row.generationRevision === input.generationRevision),
        )
        .map((row) => ({ ...row })),
    );
  }
}

describe('운영 TTS 음성 preset 환경 설정', () => {
  it('여섯 production 값과 기존 Data API 연결 값을 기본값 없이 읽는다', () => {
    expect(readBootstrapTtsVoicePresetEnv(source)).toEqual({
      connection: {
        region: source.AWS_REGION,
        database: source.DATABASE_NAME,
        resourceArn: source.RDS_RESOURCE_ARN,
        secretArn: source.RDS_SECRET_ARN,
      },
      preset,
    });
  });

  it.each([
    'TTS_VOICE_PRESET_ID',
    'TTS_VOICE_PRESET_NAME',
    'TTS_PROVIDER_NAME',
    'TTS_PROVIDER_MODEL',
    'TTS_PROVIDER_VOICE',
    'TTS_GENERATION_REVISION',
  ] as const)('%s 누락은 Data API client 생성 전에 실패한다', async (name) => {
    let clientOpened = false;

    await expect(
      runBootstrapTtsVoicePresetCommand(
        { ...source, [name]: undefined },
        () => {
          clientOpened = true;
          throw new Error('client를 열면 안 됩니다');
        },
      ),
    ).rejects.toThrow(`Missing required environment variable: ${name}`);
    expect(clientOpened).toBe(false);
  });
});

describe('운영 TTS 음성 preset bootstrap', () => {
  it('새 production preset을 정확한 enabled row로 만든다', async () => {
    const store = new InMemoryVoicePresetStore();

    await bootstrapTtsVoicePreset(store, preset);

    expect(store.rows).toEqual([preset]);
    expect(Object.keys(store.rows[0] ?? {}).sort()).toEqual(
      [
        'audioFormat',
        'enabled',
        'generationRevision',
        'id',
        'locale',
        'model',
        'name',
        'provider',
        'voice',
      ].sort(),
    );
  });

  it('완전히 같은 production preset replay는 두 번째 row 없이 성공한다', async () => {
    const store = new InMemoryVoicePresetStore();

    await bootstrapTtsVoicePreset(store, preset);
    await expect(
      bootstrapTtsVoicePreset(store, preset),
    ).resolves.toBeUndefined();

    expect(store.rows).toEqual([preset]);
  });

  it.each([
    ['같은 UUID', { ...preset, provider: 'DIFFERENT_PROVIDER' }],
    [
      '같은 이름·generation revision',
      {
        ...preset,
        id: '00000000-0000-4000-8000-000000000778',
        voice: 'different-voice',
      },
    ],
  ] as const)('%s의 다른 불변 필드는 update 없이 거절한다', async (_, row) => {
    const store = new InMemoryVoicePresetStore([row]);
    const before = structuredClone(store.rows);

    await expect(bootstrapTtsVoicePreset(store, preset)).rejects.toThrow(
      'TTS_VOICE_PRESET_IMMUTABLE_CONFLICT',
    );
    expect(store.rows).toEqual(before);
  });

  it('Data API adapter는 INSERT DO NOTHING 뒤 exact row만 조회한다', async () => {
    const statements: string[] = [];
    const client = {
      send: (
        command: ExecuteStatementCommand,
      ): Promise<ExecuteStatementCommandOutput> => {
        const sql = command.input.sql ?? '';
        statements.push(sql);
        return Promise.resolve(
          sql.startsWith('SELECT')
            ? {
                $metadata: {},
                formattedRecords: JSON.stringify([preset]),
              }
            : { $metadata: {} },
        );
      },
    };
    const store = new DataApiTtsVoicePresetBootstrapStore(client, {
      region: source.AWS_REGION,
      database: source.DATABASE_NAME,
      resourceArn: source.RDS_RESOURCE_ARN,
      secretArn: source.RDS_SECRET_ARN,
    });

    await bootstrapTtsVoicePreset(store, preset);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^INSERT INTO tts_voice_presets/iu);
    expect(statements[0]).toMatch(/ON CONFLICT DO NOTHING/iu);
    expect(statements.join('\n')).not.toMatch(/\bUPDATE\b/iu);
    expect(statements[1]).toMatch(
      /id = CAST\(:id AS uuid\)[\s\S]*name = :name[\s\S]*generation_revision = :generationRevision/iu,
    );
    expect(statements.join('\n')).not.toContain(source.RDS_SECRET_ARN);
  });

  it('package script가 production Data API bootstrap command를 노출한다', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts['db:bootstrap:tts-voice:data-api']).toBe(
      'tsx src/commands/bootstrap-tts-voice-preset.ts',
    );
  });
});
