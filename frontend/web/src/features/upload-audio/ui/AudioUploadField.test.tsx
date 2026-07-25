/** 재사용 음성 필드의 진행·취소·재시도·READY 전달을 검증한다 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { AudioUploadField } from './AudioUploadField';

const mediaAssetId = '01933b6a-8f13-7a19-b7e5-536d70f57aaa';
const mocks = vi.hoisted(() => ({
  uploadAudio: vi.fn(),
}));

vi.mock('../model/uploadAudio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../model/uploadAudio')>();
  return { ...actual, uploadAudio: mocks.uploadAudio };
});

beforeEach(() => {
  mocks.uploadAudio.mockReset();
});

describe('음성 업로드 필드', () => {
  it('진행 상태를 알리고 READY mediaAssetId만 소유 form에 전달한다', async () => {
    const deferred = createDeferred<{
      mediaAssetId: string;
      status: 'READY';
    }>();
    mocks.uploadAudio.mockImplementation(
      (
        _file: File,
        _signal: AbortSignal,
        onProgress: (progress: { status: string; percent?: number }) => void,
      ) => {
        onProgress({ status: 'uploading', percent: 40 });
        return deferred.promise;
      },
    );
    const onReady = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AudioUploadField onReady={onReady} />);

    await user.upload(
      screen.getByLabelText('음성 파일'),
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    );
    await user.click(screen.getByRole('button', { name: '음성 업로드' }));

    expect(screen.getByText('업로드 중 40%')).toBeInTheDocument();
    deferred.resolve({ mediaAssetId, status: 'READY' });

    expect(await screen.findByText('음성 자산 준비 완료')).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledWith(mediaAssetId);
  });

  it('진행 중 취소한 파일을 명시적으로 다시 시도할 수 있다', async () => {
    mocks.uploadAudio
      .mockImplementationOnce(
        (_file: File, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('취소됨', 'AbortError')),
            );
          }),
      )
      .mockResolvedValueOnce({ mediaAssetId, status: 'READY' });
    const user = userEvent.setup();
    renderWithProviders(<AudioUploadField onReady={vi.fn()} />);

    await user.upload(
      screen.getByLabelText('음성 파일'),
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    );
    await user.click(screen.getByRole('button', { name: '음성 업로드' }));
    await user.click(screen.getByRole('button', { name: '업로드 취소' }));

    expect(
      await screen.findByText('업로드가 취소되었습니다.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('음성 자산 준비 완료')).toBeInTheDocument();
    expect(mocks.uploadAudio).toHaveBeenCalledTimes(2);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
