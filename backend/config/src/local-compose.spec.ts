/** 로컬 compose가 passwordless 인증에 필요한 설정만 노출하는지 검증한다 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('로컬 compose 인증 설정', () => {
  it('legacy 비밀번호 없이 이메일 challenge 설정만 제공한다', () => {
    const compose = readFileSync(
      fileURLToPath(new URL('../../../compose.yaml', import.meta.url)),
      'utf8',
    );

    expect(compose).not.toContain('FAKE_USER_PASSWORD');
    expect(compose).not.toContain('FAKE_LEARNER_PASSWORD');
    expect(compose).toContain(
      'CHALLENGE_HMAC_PEPPER: local-only-email-challenge-pepper',
    );
    expect(compose).toContain(
      'EMAIL_LINK_CONFIRMATION_URL: http://localhost:5173/login/confirm',
    );
  });

  it('API와 단일 worker runner가 같은 TTS media volume과 절대 directory를 사용한다', () => {
    const compose = readFileSync(
      fileURLToPath(new URL('../../../compose.yaml', import.meta.url)),
      'utf8',
    );

    expect(compose).toContain(
      'FLEX_THIA_LOCAL_TTS_AUDIO_DIRECTORY: /var/lib/flex-thia/tts-audio',
    );
    expect(
      compose.match(/tts-audio:\/var\/lib\/flex-thia\/tts-audio/gu),
    ).toHaveLength(2);
    expect(compose).toContain('src/local-worker.ts');
    expect(compose).toContain('profiles: [test, workers]');
    expect(compose).not.toContain('async-dispatch-relay:');
    expect(compose).not.toContain('tts-task:');
    expect(compose).not.toContain('tts-audio-gc:');
    expect(compose).toContain('flex-thia-tts-audio:');
  });
});
