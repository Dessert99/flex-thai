/** 태국어 학습 음성의 단일 재생·중지·오류 상태를 조정한다 */
import { useEffect, useRef, useState } from 'react';

/** 같은 화면의 태국어 음성이 겹치지 않게 재생하고 실패 상태를 제공한다 */
export function useThaiAudioPlayback() {
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      playingAudioRef.current?.pause();
    },
    [],
  );

  const playAudio = async (audioUrl: string | null) => {
    setPlaybackError(null);
    if (audioUrl === null) {
      return;
    }
    if (playingAudioRef.current !== null) {
      playingAudioRef.current.pause();
      playingAudioRef.current.currentTime = 0;
    }

    const audio = new Audio(audioUrl);
    playingAudioRef.current = audio;
    try {
      await audio.play();
    } catch {
      setPlaybackError('음성을 재생할 수 없습니다.');
    }
  };

  return { playAudio, playbackError };
}
