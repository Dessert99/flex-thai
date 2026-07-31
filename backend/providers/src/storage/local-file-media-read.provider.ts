/** local TTS container를 storage key 없는 단기 HMAC URL과 WAV bytes로 제공한다 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { MediaReadUrlProvider } from '@flex-thia/domain';

const storageKeyPattern =
  /^private\/tts\/runs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.wav$/u;
const uploadedAudioStorageKeyPattern =
  /^audio\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const objectIdPattern = /^[0-9a-f]{64}$/u;
const signaturePattern = /^[0-9a-f]{64}$/u;
const maximumTtlSeconds = 5 * 60;
const audioMimeTypes = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
]);

const notFound = (): never => {
  throw new Error('LOCAL_MEDIA_NOT_FOUND');
};

const isFileNotFound = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as NodeJS.ErrnoException).code === 'ENOENT';

const readWavContainer = (content: Buffer): Buffer => {
  const separator = content.indexOf(0x0a);
  if (separator <= 0) return notFound();
  let metadata: unknown;
  try {
    metadata = JSON.parse(content.subarray(0, separator).toString('utf8'));
  } catch {
    return notFound();
  }
  const bytes = content.subarray(separator + 1);
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !('mimeType' in metadata) ||
    metadata.mimeType !== 'audio/wav' ||
    !('sizeBytes' in metadata) ||
    metadata.sizeBytes !== bytes.byteLength ||
    !('sha256' in metadata) ||
    typeof metadata.sha256 !== 'string' ||
    !signaturePattern.test(metadata.sha256) ||
    createHash('sha256').update(bytes).digest('hex') !== metadata.sha256
  ) {
    return notFound();
  }
  return bytes;
};

const readUploadContainer = (
  content: Buffer,
): { mimeType: string; bytes: Buffer } => {
  const separator = content.indexOf(0x0a);
  if (separator <= 0) return notFound();
  let metadata: unknown;
  try {
    metadata = JSON.parse(content.subarray(0, separator).toString('utf8'));
  } catch {
    return notFound();
  }
  const bytes = content.subarray(separator + 1);
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !('contentType' in metadata) ||
    typeof metadata.contentType !== 'string' ||
    !audioMimeTypes.has(metadata.contentType) ||
    !('sizeBytes' in metadata) ||
    metadata.sizeBytes !== bytes.byteLength ||
    !('sha256' in metadata) ||
    typeof metadata.sha256 !== 'string' ||
    !signaturePattern.test(metadata.sha256) ||
    createHash('sha256').update(bytes).digest('hex') !== metadata.sha256
  ) {
    return notFound();
  }
  return { mimeType: metadata.contentType, bytes };
};

/** local API origin과 한 directory에만 서명·읽기 권한을 제한한다 */
export class LocalFileMediaReadProvider implements MediaReadUrlProvider {
  private readonly directory: string;
  private readonly uploadDirectory: string | undefined;
  private readonly apiOrigin: string;

  constructor(
    directory: string,
    apiOrigin: string,
    private readonly hmacSecret: string,
    private readonly now: () => Date = () => new Date(),
    uploadDirectory?: string,
  ) {
    this.directory = resolve(directory);
    this.uploadDirectory = uploadDirectory
      ? resolve(uploadDirectory)
      : undefined;
    const parsedOrigin = new URL(apiOrigin);
    if (
      parsedOrigin.protocol !== 'http:' ||
      parsedOrigin.username ||
      parsedOrigin.password ||
      parsedOrigin.pathname !== '/' ||
      parsedOrigin.search ||
      parsedOrigin.hash ||
      hmacSecret.length < 32
    ) {
      throw new Error('LOCAL_MEDIA_CONFIGURATION_INVALID');
    }
    this.apiOrigin = parsedOrigin.origin;
  }

  /** storage key hash와 만료 시각만 포함한 local URL을 반환한다 */
  createReadUrl(storageKey: string, expiresAt: Date): Promise<string> {
    if (
      !storageKeyPattern.test(storageKey) &&
      !uploadedAudioStorageKeyPattern.test(storageKey)
    ) {
      notFound();
    }
    const expires = Math.floor(expiresAt.getTime() / 1000);
    const now = Math.floor(this.now().getTime() / 1000);
    if (expires <= now || expires - now > maximumTtlSeconds) {
      notFound();
    }
    const objectId = createHash('sha256').update(storageKey).digest('hex');
    const signature = this.sign(objectId, String(expires));
    return Promise.resolve(
      `${this.apiOrigin}/api/v1/local-media/${objectId}?expires=${expires}&signature=${signature}`,
    );
  }

  /** valid HMAC object ID가 가리키는 TTS 또는 sealed audio bytes를 읽는다 */
  async read(input: {
    objectId: string;
    expires: string;
    signature: string;
  }): Promise<{ mimeType: string; bytes: Buffer }> {
    if (
      !objectIdPattern.test(input.objectId) ||
      !/^\d{10}$/u.test(input.expires) ||
      !signaturePattern.test(input.signature)
    ) {
      return notFound();
    }
    const expires = Number(input.expires);
    const now = Math.floor(this.now().getTime() / 1000);
    if (
      !Number.isSafeInteger(expires) ||
      expires <= now ||
      expires - now > maximumTtlSeconds
    ) {
      return notFound();
    }
    const expected = Buffer.from(
      this.sign(input.objectId, input.expires),
      'hex',
    );
    const provided = Buffer.from(input.signature, 'hex');
    if (
      expected.byteLength !== provided.byteLength ||
      !timingSafeEqual(expected, provided)
    ) {
      return notFound();
    }

    try {
      const content = await readFile(
        join(this.directory, `${input.objectId}.audio`),
      );
      return { mimeType: 'audio/wav', bytes: readWavContainer(content) };
    } catch (error) {
      if (isFileNotFound(error)) {
        // 일반 audio는 별도 upload volume에서 같은 object hash로 찾는다.
      } else if (
        error instanceof Error &&
        error.message === 'LOCAL_MEDIA_NOT_FOUND'
      ) {
        throw error;
      } else {
        return notFound();
      }
    }
    if (!this.uploadDirectory) return notFound();
    try {
      const content = await readFile(
        join(this.uploadDirectory, `${input.objectId}.upload`),
      );
      return readUploadContainer(content);
    } catch (error) {
      if (isFileNotFound(error)) return notFound();
      if (error instanceof Error && error.message === 'LOCAL_MEDIA_NOT_FOUND') {
        throw error;
      }
      return notFound();
    }
  }

  private sign(objectId: string, expires: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`${objectId}.${expires}`)
      .digest('hex');
  }
}
