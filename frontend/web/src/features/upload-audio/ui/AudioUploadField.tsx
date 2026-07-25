/** 음성 파일 선택부터 READY ID 전달까지 접근 가능한 단일 행동을 제공한다 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { isApiError } from '@/shared/api';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { getMediaAsset } from '../api/mediaAssetApi';
import {
  uploadAudio,
  type AudioUploadProgress,
  type ReadyAudioAsset,
} from '../model/uploadAudio';

interface AudioUploadFieldProps {
  existingMediaAssetId?: string;
  onReady: (mediaAssetId: string) => void;
}

/** 취소·명시 재시도를 소유하고 READY가 아닌 ID는 외부 form에 내보내지 않는다 */
export function AudioUploadField({
  existingMediaAssetId,
  onReady,
}: AudioUploadFieldProps) {
  const inputId = useId();
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState<AudioUploadProgress>({
    status: 'idle',
  });
  const controller = useRef<AbortController | undefined>(undefined);
  const existingAsset = useQuery({
    enabled: existingMediaAssetId !== undefined,
    queryFn: () => getMediaAsset(existingMediaAssetId ?? ''),
    queryKey: ['admin', 'media-assets', existingMediaAssetId],
    retry: false,
  });
  const upload = useMutation({
    mutationFn: ({ audio, signal }: { audio: File; signal: AbortSignal }) =>
      uploadAudio(audio, signal, setProgress),
    onError: (error) => setProgress(toErrorProgress(error)),
    onSuccess: (ready: ReadyAudioAsset) => {
      setProgress({ status: 'ready', mediaAssetId: ready.mediaAssetId });
      onReady(ready.mediaAssetId);
    },
    retry: false,
  });

  useEffect(() => {
    if (existingAsset.data?.status === 'READY') {
      onReady(existingAsset.data.id);
    }
  }, [existingAsset.data, onReady]);

  const startUpload = () => {
    if (file === undefined) return;
    const nextController = new AbortController();
    controller.current = nextController;
    upload.mutate({ audio: file, signal: nextController.signal });
  };

  return (
    <div className='grid gap-cluster rounded-panel border border-default bg-surface-muted p-page'>
      <div className='grid gap-cluster'>
        <Label htmlFor={inputId}>음성 파일</Label>
        <Input
          accept='audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4'
          disabled={upload.isPending}
          id={inputId}
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0]);
            setProgress({ status: 'idle' });
            upload.reset();
          }}
          type='file'
        />
        <p className='text-body text-subtle'>최대 25MB의 지원 음성 파일</p>
      </div>
      <AudioUploadStatus
        existingError={existingAsset.isError}
        existingStatus={existingAsset.data?.status}
        progress={progress}
      />
      <div className='flex flex-wrap gap-cluster'>
        <Button
          disabled={file === undefined || upload.isPending}
          onClick={startUpload}
          type='button'
        >
          {progress.status === 'error' ? '다시 시도' : '음성 업로드'}
        </Button>
        {upload.isPending ? (
          <Button
            onClick={() => controller.current?.abort()}
            type='button'
            variant='outline'
          >
            업로드 취소
          </Button>
        ) : null}
        {existingMediaAssetId !== undefined &&
        !existingAsset.isPending &&
        existingAsset.data?.status !== 'READY' ? (
          <Button
            onClick={() => void existingAsset.refetch()}
            type='button'
            variant='outline'
          >
            기존 자산 상태 다시 확인
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AudioUploadStatus({
  existingError,
  existingStatus,
  progress,
}: {
  existingError: boolean;
  existingStatus: 'READY' | 'REJECTED' | 'UPLOADING' | undefined;
  progress: AudioUploadProgress;
}) {
  const message = toProgressMessage(progress);
  return (
    <div aria-live='polite'>
      {progress.status === 'error' || existingError ? (
        <Alert variant='destructive'>
          <AlertTitle>음성 자산을 준비하지 못했습니다.</AlertTitle>
          <AlertDescription>
            {existingError ? '기존 자산 상태를 확인하지 못했습니다.' : message}
          </AlertDescription>
        </Alert>
      ) : (
        <p className='text-body text-subtle'>
          {existingStatus === undefined
            ? message
            : `기존 음성 자산 상태: ${existingStatus}`}
        </p>
      )}
    </div>
  );
}

function toProgressMessage(progress: AudioUploadProgress) {
  switch (progress.status) {
    case 'hashing':
      return '파일 무결성을 확인하고 있습니다.';
    case 'uploading':
      return `업로드 중 ${progress.percent}%`;
    case 'completing':
      return '업로드 결과를 확인하고 있습니다.';
    case 'ready':
      return '음성 자산 준비 완료';
    case 'error':
      return progress.requestId === undefined
        ? progress.message
        : `${progress.message} 요청 ID: ${progress.requestId}`;
    default:
      return '업로드할 음성 파일을 선택해 주세요.';
  }
}

function toErrorProgress(error: unknown): AudioUploadProgress {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { status: 'error', message: '업로드가 취소되었습니다.' };
  }
  if (isApiError(error) && error.detail.kind === 'problem') {
    return {
      status: 'error',
      message: '서버에서 음성 자산을 확정하지 못했습니다.',
      requestId: error.detail.problem.requestId,
    };
  }
  return {
    status: 'error',
    message: '음성 업로드에 실패했습니다.',
  };
}
