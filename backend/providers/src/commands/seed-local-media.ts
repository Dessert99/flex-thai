/** local DB seed의 READY audio asset을 deterministic WAV container로 기록한다 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  LocalFileTtsAudioStore,
  resolveLocalTtsAudioDirectory,
} from '../storage/local-file-tts-audio.store.js';

const localSeedWavBytes = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac,
  0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x00, 0x00, 0x00, 0x00,
]);

/** SQL READY media row와 one-to-one인 local TTS fixture manifest */
export const localSeedMediaFixtures = [
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000013',
].map((id) => ({
  storageKey: `private/tts/runs/${id}.wav`,
  bytes: Buffer.from(localSeedWavBytes),
  sha256: createHash('sha256').update(localSeedWavBytes).digest('hex'),
}));

/** DB reset 뒤 모든 READY fixture를 immutable local audio container에 기록한다 */
export const seedLocalMedia = async ({
  directory = resolveLocalTtsAudioDirectory(),
}: {
  directory?: string;
} = {}): Promise<void> => {
  const store = new LocalFileTtsAudioStore(directory);
  const signal = new AbortController().signal;
  const deadline = new Date(Date.now() + 60_000);
  for (const fixture of localSeedMediaFixtures) {
    await store.put({
      storageKey: fixture.storageKey,
      bytes: fixture.bytes,
      mimeType: 'audio/wav',
      sha256: fixture.sha256,
      signal,
      deadline,
    });
  }
};

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  void seedLocalMedia().then(() => {
    console.log('로컬 READY media fixture를 완료했습니다.');
  });
}
