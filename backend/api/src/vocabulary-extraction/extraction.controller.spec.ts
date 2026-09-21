/* eslint-disable @typescript-eslint/require-await -- 비동기 저장소의 고정 응답을 제공한다. */
import { describe, expect, it, vi } from 'vitest';
import { ExtractionController } from './extraction.controller.js';
import type {
  ExtractionRepository,
  ExtractionJob,
} from '@flex-thia/domain/vocabulary-extraction/extraction';
import type { UploadRepository } from '@flex-thia/domain/uploads/upload.repository';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator.js';
const id = '00000000-0000-4000-8000-000000000001';
const user: AuthenticatedUser = {
  userId: id,
  sub: 'admin',
  email: 'admin@example.test',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
};
function fixture() {
  const job: ExtractionJob = {
    id,
    ownerId: id,
    requestId: id,
    requestHash: 'private-hash',
    sourceName: '자료',
    source: {
      kind: 'pdf',
      inputKey: 'private-storage-key',
      sizeBytes: 50,
      uploadId: id,
    },
    prompt: 'extract',
    config: { provider: 'gemini', model: 'test', promptVersion: '1' },
    status: 'queued',
    stage: 0,
    total: 0,
    completed: 0,
    compared: 0,
    error: null,
    leaseToken: null,
    leaseUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const repository = {
    review: vi.fn(),
    save: vi.fn(),
    latestSaved: vi.fn(),
    create: vi.fn(async () => job),
    get: vi.fn<ExtractionRepository['get']>().mockResolvedValue(job),
    list: vi.fn(async () => [job]),
    retry: vi.fn(async () => true),
    claim: vi.fn(),
    heartbeat: vi.fn(),
    chunks: vi.fn(async () => []),
    prepare: vi.fn(),
    checkpoint: vi.fn(),
    advance: vi.fn(),
    finish: vi.fn(),
  } satisfies ExtractionRepository;
  const uploads = {
    findVerifiedOwnedByIds: vi
      .fn<UploadRepository['findVerifiedOwnedByIds']>()
      .mockResolvedValue([]),
  };
  const env: Record<string, string | undefined> = {
    EXTRACTION_AI_PROVIDER: 'gemini',
    EXTRACTION_AI_MODEL: 'test',
    GEMINI_API_KEY: 'private-key',
  };
  return {
    job,
    repository,
    uploads,
    env,
    controller: new ExtractionController({ repository, uploads, env }),
  };
}
describe('extraction HTTP boundary', () => {
  it('does not expose storage keys, request hashes, or worker leases', async () => {
    const f = fixture();
    const result = await f.controller.get(id, user);
    expect(result).not.toHaveProperty('source');
    expect(result).not.toHaveProperty('requestHash');
    expect(result).not.toHaveProperty('leaseToken');
    expect(f.repository.get).toHaveBeenCalledWith(id, user.userId);
  });
  it('requires a verified PDF owned by the requesting administrator', async () => {
    const f = fixture();
    await expect(
      f.controller.create(
        {
          requestId: id,
          sourceName: '자료',
          source: { kind: 'pdf', uploadId: id },
          prompt: 'extract',
        },
        user,
      ),
    ).rejects.toThrow();
    expect(f.repository.create).not.toHaveBeenCalled();
    expect(f.uploads.findVerifiedOwnedByIds).toHaveBeenCalledWith(user.userId, [
      id,
    ]);
  });
  it('does not retry another owner’s job', async () => {
    const f = fixture();
    vi.mocked(f.repository.get).mockResolvedValue(null);
    await expect(f.controller.retry(id, user)).rejects.toThrow();
    expect(f.repository.retry).not.toHaveBeenCalled();
  });
  it('rejects creation without real AI configuration', async () => {
    const f = fixture();
    delete f.env.GEMINI_API_KEY;
    await expect(
      f.controller.create(
        {
          requestId: id,
          sourceName: '자료',
          source: { kind: 'url', url: 'https://example.com' },
          prompt: 'extract',
        },
        user,
      ),
    ).rejects.toThrow();
    expect(f.repository.create).not.toHaveBeenCalled();
  });
  it('saves the model and instruction snapshot for URL work', async () => {
    const f = fixture();
    await f.controller.create(
      {
        requestId: id,
        sourceName: '자료',
        source: { kind: 'url', url: 'https://example.com' },
        prompt: 'extract',
      },
      user,
    );
    expect(f.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: id,
        requestId: id,
        prompt: 'extract',
        config: { provider: 'gemini', model: 'test', promptVersion: '1' },
      }),
    );
  });
});

describe('최종 저장 요청', () => {
  it('다른 관리자의 작업은 저장할 수 없다', async () => {
    const f = fixture();
    f.repository.get.mockResolvedValue(null);
    await expect(
      f.controller.save(id, { selectedIds: ['0:0'] }, user),
    ).rejects.toThrow();
    expect(f.repository.save).not.toHaveBeenCalled();
  });
  it('클라이언트가 단어 내용을 추가하거나 식별자를 중복 전송할 수 없다', async () => {
    const f = fixture();
    for (const body of [
      { selectedIds: ['0:0'], thai: '변조' },
      { selectedIds: ['0:0', '0:0'] },
    ]) {
      await expect(f.controller.save(id, body, user)).rejects.toThrow();
    }
    expect(f.repository.save).not.toHaveBeenCalled();
  });
  it('선택한 식별자와 사용자만 저장소에 전달한다', async () => {
    const f = fixture();
    await f.controller.save(id, { selectedIds: ['0:0'] }, user);
    expect(f.repository.save).toHaveBeenCalledWith(id, user.userId, ['0:0']);
  });
});

it('accepts only a verified owned image for image extraction', async () => {
  const f = fixture();
  const input = {
    requestId: id,
    sourceName: '사진.png',
    source: { kind: 'image', uploadId: id },
    prompt: 'extract',
  };
  await expect(f.controller.create(input, user)).rejects.toThrow();
  f.uploads.findVerifiedOwnedByIds.mockResolvedValue([
    { uploadId: id, inputType: 'PDF', inputKey: 'file', sizeBytes: 12 },
  ]);
  await expect(f.controller.create(input, user)).rejects.toThrow();
  expect(f.repository.create).not.toHaveBeenCalled();
  f.uploads.findVerifiedOwnedByIds.mockResolvedValue([
    { uploadId: id, inputType: 'IMAGE', inputKey: 'file', sizeBytes: 12 },
  ]);
  await f.controller.create(input, user);
  expect(f.repository.create).toHaveBeenCalledWith(
    expect.objectContaining({
      source: { kind: 'image', inputKey: 'file', sizeBytes: 12, uploadId: id },
    }),
  );
});
