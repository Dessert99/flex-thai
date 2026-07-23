/** 음성·어휘·문장 schema의 게시 보존과 소유 관계를 검증한다 */
import { readFileSync } from 'node:fs';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  expressionOccurrences,
  mediaAssets,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyMeanings,
  vocabularyMeaningPronunciations,
  vocabularyPronunciations,
} from './index.js';

const migrationSql = readFileSync(
  new URL('../../drizzle/0003_content-foundations.sql', import.meta.url),
  'utf8',
);

const foreignKeySummaries = (
  foreignKeys: ReturnType<typeof getTableConfig>['foreignKeys'],
) =>
  foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();

    return {
      name: foreignKey.getName(),
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      onDelete: foreignKey.onDelete,
    };
  });

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
    expect(
      getTableConfig(mediaAssets).checks.map((constraint) => constraint.name),
    ).toEqual(
      expect.arrayContaining([
        'media_assets_declared_size_safe_integer',
        'media_assets_size_safe_integer',
      ]),
    );
  });

  it('어휘 정규화 표기 한 컬럼에 unique index를 둔다', () => {
    const config = getTableConfig(vocabularies);
    const normalizedThaiIndex = config.indexes.find(
      (index) => index.config.name === 'vocabularies_normalized_thai_unique',
    );

    expect(normalizedThaiIndex?.config.unique).toBe(true);
    expect(normalizedThaiIndex?.config.columns).toHaveLength(1);
    expect(normalizedThaiIndex?.config.columns[0]).toMatchObject({
      name: 'normalized_thai',
    });
  });

  it('복합 FK 대상 쌍을 table-level unique 제약으로 선언한다', () => {
    expect(
      getTableConfig(vocabularyMeanings).uniqueConstraints.map(
        (constraint) => ({
          name: constraint.name,
          columns: constraint.columns.map((column) => column.name),
        }),
      ),
    ).toContainEqual({
      name: 'vocabulary_meanings_id_vocabulary_unique',
      columns: ['id', 'vocabulary_id'],
    });
    expect(
      getTableConfig(vocabularyPronunciations).uniqueConstraints.map(
        (constraint) => ({
          name: constraint.name,
          columns: constraint.columns.map((column) => column.name),
        }),
      ),
    ).toContainEqual({
      name: 'vocabulary_pronunciations_id_vocabulary_unique',
      columns: ['id', 'vocabulary_id'],
    });
  });

  it('뜻·발음 연결과 토큰은 같은 어휘 소유권을 복합 FK로 고정한다', () => {
    expect(
      foreignKeySummaries(
        getTableConfig(vocabularyMeaningPronunciations).foreignKeys,
      ),
    ).toEqual([
      {
        name: 'vocabulary_meaning_pronunciations_meaning_fk',
        columns: ['meaning_id', 'vocabulary_id'],
        foreignColumns: ['id', 'vocabulary_id'],
        onDelete: 'restrict',
      },
      {
        name: 'vocabulary_meaning_pronunciations_pronunciation_fk',
        columns: ['pronunciation_id', 'vocabulary_id'],
        foreignColumns: ['id', 'vocabulary_id'],
        onDelete: 'restrict',
      },
    ]);
    expect(
      foreignKeySummaries(
        getTableConfig(tokenOccurrences).foreignKeys.filter(
          (foreignKey) => foreignKey.reference().columns.length > 1,
        ),
      ),
    ).toEqual([
      {
        name: 'token_occurrences_meaning_vocabulary_fk',
        columns: ['meaning_id', 'vocabulary_id'],
        foreignColumns: ['id', 'vocabulary_id'],
        onDelete: 'restrict',
      },
      {
        name: 'token_occurrences_pronunciation_vocabulary_fk',
        columns: ['pronunciation_id', 'vocabulary_id'],
        foreignColumns: ['id', 'vocabulary_id'],
        onDelete: 'restrict',
      },
    ]);
  });

  it('문장 버전 컬럼·unique index·양수 check를 고정한다', () => {
    const config = getTableConfig(thaiSentenceVersions);
    const sentenceVersionIndex = config.indexes.find(
      (index) =>
        index.config.name === 'thai_sentence_versions_sentence_version_unique',
    );

    expect(Object.keys(getTableColumns(thaiSentenceVersions))).toEqual([
      'id',
      'sentenceId',
      'version',
      'originalText',
      'translationKo',
      'pronunciationKo',
      'toneMarks',
      'mediaAssetId',
      'frozenAt',
      'createdAt',
    ]);
    expect(sentenceVersionIndex?.config.unique).toBe(true);
    expect(sentenceVersionIndex?.config.columns).toHaveLength(2);
    expect(sentenceVersionIndex?.config.columns).toMatchObject([
      { name: 'sentence_id' },
      { name: 'version' },
    ]);
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      'thai_sentence_versions_version_positive',
    );
  });

  it('표현 대표 여부를 보존한다', () => {
    expect(Object.keys(getTableColumns(expressionOccurrences))).toContain(
      'representative',
    );
  });

  it('bigint size를 JavaScript safe integer 범위로 제한한다', () => {
    expect(migrationSql).toContain(
      'CONSTRAINT "media_assets_declared_size_safe_integer" CHECK ("media_assets"."declared_size_bytes" > 0 and "media_assets"."declared_size_bytes" <= 9007199254740991)',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "media_assets_size_safe_integer" CHECK ("media_assets"."size_bytes" is null or ("media_assets"."size_bytes" > 0 and "media_assets"."size_bytes" <= 9007199254740991))',
    );
  });

  it('복합 FK target unique를 generated SQL의 FK보다 먼저 선언한다', () => {
    const targetUniquePositions = [
      migrationSql.indexOf('"vocabulary_meanings_id_vocabulary_unique"'),
      migrationSql.indexOf('"vocabulary_pronunciations_id_vocabulary_unique"'),
    ];
    const compositeForeignKeyPositions = [
      migrationSql.indexOf('"vocabulary_meaning_pronunciations_meaning_fk"'),
      migrationSql.indexOf(
        '"vocabulary_meaning_pronunciations_pronunciation_fk"',
      ),
    ];

    expect(targetUniquePositions).not.toContain(-1);
    expect(compositeForeignKeyPositions).not.toContain(-1);
    expect(Math.max(...targetUniquePositions)).toBeLessThan(
      Math.min(...compositeForeignKeyPositions),
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "vocabulary_meanings_id_vocabulary_unique" UNIQUE("id","vocabulary_id")',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "vocabulary_pronunciations_id_vocabulary_unique" UNIQUE("id","vocabulary_id")',
    );
  });
});
