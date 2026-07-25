/** 관리자 음성 업로드의 계약·전송 순서·실패 경계를 검증한다 */
import { ApiError } from '@/shared/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMediaAsset } from '../api/mediaAssetApi';
import {
  createAudioUploadRequest,
  uploadAudio,
  type AudioUploadProgress,
} from './uploadAudio';

const mediaAssetId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const mocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, authenticatedRequest: mocks.authenticatedRequest };
});

beforeEach(() => {
  mocks.authenticatedRequest.mockReset();
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('음성 업로드 요청 검증', () => {
  it.each([
    [{ name: 'voice.aac', size: 10, type: 'audio/aac' }, '지원하지 않는 MIME'],
    [
      { name: 'voice.mp3', size: 25 * 1024 * 1024 + 1, type: 'audio/mpeg' },
      '25MB 초과',
    ],
  ])('%s 파일은 공개 요청 계약에서 거부한다', (file) => {
    expect(() =>
      createAudioUploadRequest(file as File, 'a'.repeat(64)),
    ).toThrow();
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
  });
});

describe('음성 업로드 파이프라인', () => {
  it('요청, exact form POST, 완료 순서로 READY 자산을 반환한다', async () => {
    const order: string[] = [];
    mocks.authenticatedRequest.mockImplementation(
      ({ path }: { path: string }) => {
        if (path.endsWith('/complete')) {
          order.push('complete');
          return Promise.resolve({
            mediaAssetId,
            status: 'READY',
            readyAt: '2026-07-25T00:00:01.000Z',
          });
        }
        order.push('request');
        return Promise.resolve(createUploadRequiredResponse());
      },
    );
    mocks.fetch.mockImplementation((_url: string, init: RequestInit) => {
      order.push('s3');
      expect(init.headers).toBeUndefined();
      expect(Array.from((init.body as FormData).entries())).toEqual([
        ['key', 'audio/object-key'],
        ['policy', 'signed-policy'],
        ['file', expect.any(File)],
      ]);
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const progress: AudioUploadProgress[] = [];

    await expect(
      uploadAudio(createAudioFile(), new AbortController().signal, (state) =>
        progress.push(state),
      ),
    ).resolves.toEqual({ mediaAssetId, status: 'READY' });

    expect(order).toEqual(['request', 's3', 'complete']);
    expect(progress).toContainEqual({ status: 'completing' });
    expect(progress.at(-1)).toEqual({
      status: 'ready',
      mediaAssetId,
    });
  });

  it('READY 재사용 응답에는 S3 전송과 완료 요청을 하지 않는다', async () => {
    mocks.authenticatedRequest.mockResolvedValue({
      mediaAssetId,
      status: 'READY',
      uploadRequired: false,
      reused: true,
    });

    await expect(
      uploadAudio(createAudioFile(), new AbortController().signal),
    ).resolves.toEqual({ mediaAssetId, status: 'READY' });

    expect(mocks.authenticatedRequest).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('취소 신호가 있으면 어떤 요청도 시작하지 않는다', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadAudio(createAudioFile(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled();
  });

  it('S3 실패 뒤에는 완료 요청을 보내지 않는다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(
      createUploadRequiredResponse(),
    );
    mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      uploadAudio(createAudioFile(), new AbortController().signal),
    ).rejects.toThrow('S3');
    expect(mocks.authenticatedRequest).toHaveBeenCalledOnce();
  });

  it('완료 409를 READY로 보고하지 않는다', async () => {
    const progress: AudioUploadProgress[] = [];
    mocks.authenticatedRequest
      .mockResolvedValueOnce(createUploadRequiredResponse())
      .mockRejectedValueOnce(createProblemError(409));
    mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      uploadAudio(createAudioFile(), new AbortController().signal, (state) =>
        progress.push(state),
      ),
    ).rejects.toMatchObject({
      detail: { kind: 'problem', problem: { status: 409 } },
    });
    expect(progress).not.toContainEqual({
      status: 'ready',
      mediaAssetId,
    });
  });
});

describe('기존 음성 자산 상태 조회', () => {
  it('기존 mediaAssetId를 인증된 단건 조회로 확인한다', async () => {
    mocks.authenticatedRequest.mockResolvedValue(createReadyDetail());

    await expect(getMediaAsset(mediaAssetId)).resolves.toMatchObject({
      id: mediaAssetId,
      status: 'READY',
    });
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/admin/media-assets/${mediaAssetId}`,
      }),
    );
  });
});

function createAudioFile() {
  const bytes = new TextEncoder().encode('audio');
  const file = new File([bytes], 'voice.mp3', { type: 'audio/mpeg' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
  });
  return file;
}

function createUploadRequiredResponse() {
  return {
    mediaAssetId,
    status: 'UPLOADING',
    uploadRequired: true,
    upload: {
      url: 'https://uploads.example.com/',
      fields: { key: 'audio/object-key', policy: 'signed-policy' },
      expiresAt: '2026-07-25T00:05:00.000Z',
    },
  };
}

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: `https://flex-thia.dev/problems/http-${status}`,
      title: '요청을 처리하지 못했습니다.',
      status,
      code: `HTTP_${status}`,
      requestId: 'request-audio',
      fieldErrors: [],
    },
  });
}

function createReadyDetail() {
  return {
    id: mediaAssetId,
    kind: 'AUDIO',
    status: 'READY',
    declaredMimeType: 'audio/mpeg',
    declaredSizeBytes: 5,
    declaredSha256: 'a'.repeat(64),
    mimeType: 'audio/mpeg',
    sizeBytes: 5,
    sha256: 'a'.repeat(64),
    createdAt: '2026-07-25T00:00:00.000Z',
    readyAt: '2026-07-25T00:00:01.000Z',
    usage: {
      pronunciations: { count: 0, ids: [] },
      sentences: { count: 0, ids: [] },
    },
  };
}
