/** 생성 문제 DRAFT의 nullable 음성과 기존 문장 FK 경계를 검증한다 */
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { thaiSentenceVersions } from './thai-content.schema.js';

describe('태국어 문장 버전 schema', () => {
  it('생성 DRAFT가 TTS 전에는 음성 없이 저장될 수 있다', () => {
    expect(getTableColumns(thaiSentenceVersions).mediaAssetId.notNull).toBe(
      false,
    );
  });

  it('nullable 음성에도 media asset restrict FK를 보존한다', () => {
    const mediaForeignKey = getTableConfig(
      thaiSentenceVersions,
    ).foreignKeys.find(({ reference }) => {
      const config = reference();
      return config.columns.some(({ name }) => name === 'media_asset_id');
    });

    expect(mediaForeignKey?.onDelete).toBe('restrict');
    expect(getTableName(mediaForeignKey!.reference().foreignTable)).toBe(
      'media_assets',
    );
  });
});
