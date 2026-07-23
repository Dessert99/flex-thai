/** 음성·어휘·문장 schema의 게시 보존과 소유 관계를 검증한다 */
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  expressionOccurrences,
  mediaAssets,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeaningPronunciations,
} from './index.js';

describe('콘텐츠 기반 데이터베이스 schema', () => {
  it('음성 자산은 선언 정보와 실제 검증 정보 및 READY 시각을 분리한다', () => {
    expect(Object.keys(getTableColumns(mediaAssets))).toEqual(
      expect.arrayContaining([
        'storageKey',
        'declaredMimeType',
        'declaredSizeBytes',
        'declaredSha256',
        'mimeType',
        'sizeBytes',
        'sha256',
        'status',
        'readyAt',
      ]),
    );
  });

  it('어휘 정규화 표기에 유일 제약을 둔다', () => {
    const config = getTableConfig(vocabularies);

    expect(config.indexes.map((index) => index.config.name)).toContain(
      'vocabularies_normalized_thai_unique',
    );
  });

  it('뜻·발음 연결과 토큰은 같은 어휘 소유권을 복합 FK로 고정한다', () => {
    expect(
      getTableConfig(vocabularyMeaningPronunciations).foreignKeys,
    ).toHaveLength(2);
    expect(
      getTableConfig(tokenOccurrences).foreignKeys.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('문장 버전 번호와 표현 대표 여부를 보존한다', () => {
    expect(Object.keys(getTableColumns(thaiSentenceVersions))).toEqual(
      expect.arrayContaining(['sentenceId', 'version', 'frozenAt']),
    );
    expect(Object.keys(getTableColumns(expressionOccurrences))).toContain(
      'representative',
    );
  });
});
