/** 공용 어휘의 생성·게시·숨김·복구 규칙을 검증한다 */
import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '../media/media-asset.js';
import {
  createVocabularyDraft,
  hideVocabulary,
  publishVocabulary,
  restoreVocabulary,
} from './vocabulary.js';

const mediaAsset = (status: MediaAsset['status']): MediaAsset => {
  const common = {
    id: 'asset-id',
    kind: 'AUDIO' as const,
    storageKey: 'audio/asset-id',
    declaredMimeType: 'audio/mpeg',
    declaredSizeBytes: 1,
    declaredSha256: 'a'.repeat(64),
  };

  if (status === 'READY') {
    return {
      ...common,
      mimeType: 'audio/mpeg',
      sizeBytes: 1,
      sha256: 'a'.repeat(64),
      status,
      readyAt: new Date(),
    };
  }
  if (status === 'REJECTED') {
    return {
      ...common,
      mimeType: 'audio/ogg',
      sizeBytes: 1,
      sha256: 'b'.repeat(64),
      status,
      readyAt: null,
    };
  }

  return {
    ...common,
    mimeType: null,
    sizeBytes: null,
    sha256: null,
    status,
    readyAt: null,
  };
};

describe('Vocabulary 공용 어휘 상태 전이', () => {
  it('표시 태국어를 보존하고 정규화 표기를 중복 키로 만든다', () => {
    expect(
      createVocabularyDraft({
        id: 'vocabulary-id',
        thai: '  สวัสดี\u200B   ครับ  ',
        kind: 'EXPRESSION',
      }),
    ).toMatchObject({
      thai: '  สวัสดี\u200B   ครับ  ',
      normalizedThai: 'สวัสดี ครับ',
      status: 'DRAFT',
    });
  });

  it('모든 발음 음성이 READY일 때만 게시한다', () => {
    const draft = createVocabularyDraft({
      id: 'vocabulary-id',
      thai: 'สวัสดี',
      kind: 'WORD',
    });

    expect(publishVocabulary(draft, [mediaAsset('READY')]).status).toBe(
      'PUBLISHED',
    );
    expect(() =>
      publishVocabulary(draft, [mediaAsset('UPLOADING')]),
    ).toThrowError(
      expect.objectContaining({ code: 'VOCABULARY_AUDIO_NOT_READY' }),
    );
  });

  it('게시 어휘는 숨긴 뒤 복구할 수 있다', () => {
    const published = publishVocabulary(
      createVocabularyDraft({
        id: 'vocabulary-id',
        thai: 'สวัสดี',
        kind: 'WORD',
      }),
      [mediaAsset('READY')],
    );

    expect(restoreVocabulary(hideVocabulary(published)).status).toBe(
      'PUBLISHED',
    );
  });
});
