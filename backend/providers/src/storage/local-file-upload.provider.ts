/** local browser upload을 HMAC policy와 private filesystem object로 구현한다 */
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  AudioUploadStorageError,
  type AudioUploadStorage,
  type InputType,
  type UploadInspection,
  type UploadPolicy,
  type UploadStorage,
} from '@flex-thia/domain';
import { PDFDocument } from 'pdf-lib';

type LocalUploadErrorCode = 'LOCAL_UPLOAD_INVALID' | 'LOCAL_UPLOAD_NOT_FOUND';

interface UploadTokenPayload {
  uploadId: string;
  storageKey: string;
  contentType: string;
  maximumBytes: number;
  expiresAt: number;
  sha256?: string;
}

interface StoredUploadObject {
  contentType: string;
  bytes: Buffer;
}

const maximumUploadBytes = 25 * 1024 * 1024;
const policyTtlSeconds = 600;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const uuidSource = uuidPattern.source.slice(1, -1);
const inputStorageKeyPattern = new RegExp(
  `^inputs/${uuidSource}/${uuidSource}$`,
  'iu',
);
const audioTemporaryStorageKeyPattern = new RegExp(
  `^audio/uploads/${uuidSource}$`,
  'iu',
);
const audioFinalStorageKeyPattern = new RegExp(`^audio/${uuidSource}$`, 'iu');
const sha256Pattern = /^[0-9a-f]{64}$/iu;
const tokenPattern = /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/u;

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((value, index) => bytes[index] === value);

const isFileSystemError = (
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException =>
  error instanceof Error &&
  'code' in error &&
  (error as NodeJS.ErrnoException).code === code;

const isInputStorageKey = (storageKey: string): boolean =>
  inputStorageKeyPattern.test(storageKey);

const isAudioTemporaryStorageKey = (storageKey: string): boolean =>
  audioTemporaryStorageKeyPattern.test(storageKey);

const isAudioFinalStorageKey = (storageKey: string): boolean =>
  audioFinalStorageKeyPattern.test(storageKey);

const detectImage = (bytes: Uint8Array): boolean =>
  startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
  startsWith(bytes, [0xff, 0xd8, 0xff]) ||
  (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP');

const detectText = (bytes: Uint8Array): boolean => {
  try {
    return !new TextDecoder('utf-8', { fatal: true })
      .decode(bytes)
      .includes('\u0000');
  } catch {
    return false;
  }
};

/** filesystem path와 HMAC 세부를 HTTP 경계에 노출하지 않는 local 오류 */
export class LocalFileUploadError extends Error {
  constructor(readonly code: LocalUploadErrorCode) {
    super(code);
    this.name = 'LocalFileUploadError';
  }
}

/** local upload directory를 명시 env 또는 host temp 기본값으로 결정한다 */
export const resolveLocalUploadDirectory = (
  source: Record<string, string | undefined> = process.env,
  workingDirectory: string = process.cwd(),
  temporaryDirectory: string = tmpdir(),
): string => {
  const configured = source.FLEX_THIA_LOCAL_UPLOAD_DIRECTORY?.trim();
  if (!configured) return join(temporaryDirectory, 'flex-thia', 'uploads');
  return isAbsolute(configured)
    ? configured
    : resolve(workingDirectory, configured);
};

/** content와 audio의 existing upload port를 local-only filesystem으로 함께 구현한다 */
export class LocalFileUploadProvider
  implements UploadStorage, AudioUploadStorage
{
  private readonly directory: string;
  private readonly publicOrigin: string;

  constructor(
    directory: string,
    publicOrigin: string,
    private readonly hmacSecret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.directory = resolve(directory);
    const parsedOrigin = new URL(publicOrigin);
    if (
      parsedOrigin.protocol !== 'http:' ||
      parsedOrigin.username ||
      parsedOrigin.password ||
      parsedOrigin.pathname !== '/' ||
      parsedOrigin.search ||
      parsedOrigin.hash ||
      hmacSecret.length < 32
    ) {
      throw new Error('LOCAL_UPLOAD_CONFIGURATION_INVALID');
    }
    this.publicOrigin = parsedOrigin.origin;
  }

  /** 콘텐츠 제작 input의 exact key·MIME·declared size를 local token에 고정한다 */
  async createPolicy(
    input: Parameters<UploadStorage['createPolicy']>[0],
  ): Promise<UploadPolicy> {
    if (
      !uuidPattern.test(input.uploadId) ||
      !isInputStorageKey(input.objectKey) ||
      input.objectKey.split('/').at(-1) !== input.uploadId ||
      input.declaredSizeBytes < 1 ||
      input.declaredSizeBytes > maximumUploadBytes
    ) {
      throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
    }
    const token = this.createToken({
      uploadId: input.uploadId,
      storageKey: input.objectKey,
      contentType: input.contentType,
      maximumBytes: input.declaredSizeBytes,
    });
    return {
      uploadId: input.uploadId,
      url: `${this.publicOrigin}/api/v1/local-uploads/${token.value}`,
      fields: {
        key: input.objectKey,
        'Content-Type': input.contentType,
      },
      expiresAt: token.expiresAt.toISOString(),
    };
  }

  /** 실제 local object bytes에서 content type과 PDF 특성을 다시 계산한다 */
  async inspectObject(objectKey: string): Promise<UploadInspection> {
    if (!isInputStorageKey(objectKey)) {
      throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
    }
    const object = await this.readObject(objectKey);
    if (!object) throw new LocalFileUploadError('LOCAL_UPLOAD_NOT_FOUND');
    return {
      sizeBytes: object.bytes.byteLength,
      contentType: object.contentType,
      ...(await this.detectType(object.bytes)),
    };
  }

  /** audio temporary key·MIME·exact SHA-256을 same-origin form token에 고정한다 */
  async createUpload(
    input: Parameters<AudioUploadStorage['createUpload']>[0],
  ): Promise<Awaited<ReturnType<AudioUploadStorage['createUpload']>>> {
    if (
      !uuidPattern.test(input.mediaAssetId) ||
      !isAudioTemporaryStorageKey(input.storageKey) ||
      input.storageKey.split('/').at(-1) !== input.mediaAssetId ||
      input.sizeBytes < 1 ||
      input.sizeBytes > maximumUploadBytes ||
      !sha256Pattern.test(input.sha256)
    ) {
      throw new AudioUploadStorageError();
    }
    const token = this.createToken({
      uploadId: input.mediaAssetId,
      storageKey: input.storageKey,
      contentType: input.mimeType,
      maximumBytes: input.sizeBytes,
      sha256: input.sha256.toLowerCase(),
    });
    return {
      url: `${this.publicOrigin}/api/v1/local-uploads/${token.value}`,
      fields: {
        key: input.storageKey,
        'Content-Type': input.mimeType,
      },
      expiresAt: token.expiresAt.toISOString(),
    };
  }

  /** multipart controller가 전달한 form fields와 bytes를 token 조건 아래 저장한다 */
  async store(input: {
    token: string;
    storageKey: string;
    contentType: string;
    bytes: Buffer;
    mimeType?: string;
  }): Promise<void> {
    const token = this.readToken(input.token);
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    if (
      input.storageKey !== token.storageKey ||
      input.contentType !== token.contentType ||
      (input.mimeType !== undefined && input.mimeType !== token.contentType) ||
      input.bytes.byteLength < 1 ||
      input.bytes.byteLength > token.maximumBytes ||
      (token.sha256 !== undefined && sha256 !== token.sha256)
    ) {
      throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
    }
    await this.writeObject(token.storageKey, {
      contentType: token.contentType,
      bytes: input.bytes,
    });
  }

  /** temporary audio object를 final key로 원자 이동한 actual inspection을 반환한다 */
  async inspectAndSeal(
    input: Parameters<AudioUploadStorage['inspectAndSeal']>[0],
  ): Promise<Awaited<ReturnType<AudioUploadStorage['inspectAndSeal']>>> {
    if (
      !isAudioTemporaryStorageKey(input.temporaryStorageKey) ||
      !isAudioFinalStorageKey(input.finalStorageKey) ||
      input.temporaryStorageKey.split('/').at(-1) !==
        input.finalStorageKey.split('/').at(-1)
    ) {
      throw new AudioUploadStorageError();
    }
    try {
      const finalObject = await this.readObject(input.finalStorageKey);
      if (finalObject) return this.toAudioInspection(finalObject);
      const temporaryObject = await this.readObject(input.temporaryStorageKey);
      if (!temporaryObject)
        throw new LocalFileUploadError('LOCAL_UPLOAD_NOT_FOUND');
      try {
        await rename(
          this.objectPath(input.temporaryStorageKey),
          this.objectPath(input.finalStorageKey),
        );
      } catch (error) {
        if (!isFileSystemError(error, 'ENOENT')) throw error;
        const concurrentFinal = await this.readObject(input.finalStorageKey);
        if (!concurrentFinal) throw error;
        return this.toAudioInspection(concurrentFinal);
      }
      return this.toAudioInspection(temporaryObject);
    } catch {
      throw new AudioUploadStorageError();
    }
  }

  private createToken(input: Omit<UploadTokenPayload, 'expiresAt'>): {
    value: string;
    expiresAt: Date;
  } {
    const expiresAt = new Date(this.now().getTime() + policyTtlSeconds * 1000);
    const payload = Buffer.from(
      JSON.stringify({
        ...input,
        expiresAt: Math.floor(expiresAt.getTime() / 1000),
      }),
      'utf8',
    ).toString('base64url');
    return { value: `${payload}.${this.sign(payload)}`, expiresAt };
  }

  private readToken(value: string): UploadTokenPayload {
    if (!tokenPattern.test(value)) {
      throw new LocalFileUploadError('LOCAL_UPLOAD_NOT_FOUND');
    }
    const [encodedPayload, signature] = value.split('.');
    const expected = Buffer.from(this.sign(encodedPayload!), 'hex');
    const provided = Buffer.from(signature!, 'hex');
    if (
      expected.byteLength !== provided.byteLength ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new LocalFileUploadError('LOCAL_UPLOAD_NOT_FOUND');
    }
    try {
      const payload: unknown = JSON.parse(
        Buffer.from(encodedPayload!, 'base64url').toString('utf8'),
      );
      if (!this.isValidTokenPayload(payload)) {
        throw new LocalFileUploadError('LOCAL_UPLOAD_NOT_FOUND');
      }
      return payload;
    } catch (error) {
      if (error instanceof LocalFileUploadError) throw error;
      throw new LocalFileUploadError('LOCAL_UPLOAD_NOT_FOUND');
    }
  }

  private isValidTokenPayload(value: unknown): value is UploadTokenPayload {
    if (
      value === null ||
      typeof value !== 'object' ||
      !('uploadId' in value) ||
      typeof value.uploadId !== 'string' ||
      !uuidPattern.test(value.uploadId) ||
      !('storageKey' in value) ||
      typeof value.storageKey !== 'string' ||
      !(
        isInputStorageKey(value.storageKey) ||
        isAudioTemporaryStorageKey(value.storageKey)
      ) ||
      !('contentType' in value) ||
      typeof value.contentType !== 'string' ||
      !('maximumBytes' in value) ||
      typeof value.maximumBytes !== 'number' ||
      !Number.isSafeInteger(value.maximumBytes) ||
      value.maximumBytes < 1 ||
      value.maximumBytes > maximumUploadBytes ||
      !('expiresAt' in value) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isSafeInteger(value.expiresAt)
    ) {
      return false;
    }
    const now = Math.floor(this.now().getTime() / 1000);
    if (value.expiresAt <= now || value.expiresAt - now > policyTtlSeconds) {
      return false;
    }
    return (
      !('sha256' in value) ||
      (typeof value.sha256 === 'string' && sha256Pattern.test(value.sha256))
    );
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`local-upload.${encodedPayload}`)
      .digest('hex');
  }

  private async writeObject(
    storageKey: string,
    object: StoredUploadObject,
  ): Promise<void> {
    const objectPath = this.objectPath(storageKey);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(
      this.directory,
      `.${createHash('sha256').update(storageKey).digest('hex')}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(
        temporaryPath,
        Buffer.concat([
          Buffer.from(
            `${JSON.stringify({
              contentType: object.contentType,
              sizeBytes: object.bytes.byteLength,
              sha256: createHash('sha256').update(object.bytes).digest('hex'),
            })}\n`,
            'utf8',
          ),
          object.bytes,
        ]),
        { flag: 'wx', mode: 0o600 },
      );
      // rename은 같은 directory에서만 수행해 부분 object가 inspection에 보이지 않게 한다.
      await rename(temporaryPath, objectPath);
    } finally {
      await this.unlinkIfPresent(temporaryPath);
    }
  }

  private async readObject(
    storageKey: string,
  ): Promise<StoredUploadObject | null> {
    try {
      const content = await readFile(this.objectPath(storageKey));
      const separator = content.indexOf(0x0a);
      if (separator <= 0)
        throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
      const metadata: unknown = JSON.parse(
        content.subarray(0, separator).toString('utf8'),
      );
      if (
        metadata === null ||
        typeof metadata !== 'object' ||
        !('contentType' in metadata) ||
        typeof metadata.contentType !== 'string'
      ) {
        throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
      }
      const bytes = content.subarray(separator + 1);
      if (
        ('sizeBytes' in metadata || 'sha256' in metadata) &&
        (!('sizeBytes' in metadata) ||
          metadata.sizeBytes !== bytes.byteLength ||
          !('sha256' in metadata) ||
          typeof metadata.sha256 !== 'string' ||
          !sha256Pattern.test(metadata.sha256) ||
          createHash('sha256').update(bytes).digest('hex') !== metadata.sha256)
      ) {
        throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
      }
      return {
        contentType: metadata.contentType,
        bytes,
      };
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) return null;
      if (error instanceof LocalFileUploadError) throw error;
      throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
    }
  }

  private objectPath(storageKey: string): string {
    if (
      !isInputStorageKey(storageKey) &&
      !isAudioTemporaryStorageKey(storageKey) &&
      !isAudioFinalStorageKey(storageKey)
    ) {
      throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
    }
    return join(
      this.directory,
      `${createHash('sha256').update(storageKey).digest('hex')}.upload`,
    );
  }

  private async unlinkIfPresent(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
      }
    }
  }

  private async detectType(bytes: Uint8Array): Promise<{
    detectedType: InputType | 'UNKNOWN';
    encryptedPdf: boolean;
    pdfPageCount: number | null;
  }> {
    if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      try {
        const document = await PDFDocument.load(bytes);
        return {
          detectedType: 'PDF',
          encryptedPdf: false,
          pdfPageCount: document.getPageCount(),
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes('encrypted')
        ) {
          return {
            detectedType: 'PDF',
            encryptedPdf: true,
            pdfPageCount: null,
          };
        }
        throw new LocalFileUploadError('LOCAL_UPLOAD_INVALID');
      }
    }
    if (detectImage(bytes)) {
      return { detectedType: 'IMAGE', encryptedPdf: false, pdfPageCount: null };
    }
    if (detectText(bytes)) {
      return { detectedType: 'TEXT', encryptedPdf: false, pdfPageCount: null };
    }
    return { detectedType: 'UNKNOWN', encryptedPdf: false, pdfPageCount: null };
  }

  private toAudioInspection(
    object: StoredUploadObject,
  ): Awaited<ReturnType<AudioUploadStorage['inspectAndSeal']>> {
    return {
      mimeType: object.contentType as Awaited<
        ReturnType<AudioUploadStorage['inspectAndSeal']>
      >['mimeType'],
      sizeBytes: object.bytes.byteLength,
      sha256: createHash('sha256').update(object.bytes).digest('hex'),
    };
  }
}
