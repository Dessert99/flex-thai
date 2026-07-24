/** 관리자 media 상태와 발음·문장 사용처를 storage key 없이 조회한다 */
import { asc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  mediaAssets,
  thaiSentenceVersions,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type AdminMediaDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 관리자 media 상세의 ID 사용처 */
export interface AdminMediaUsageProjection {
  count: number;
  ids: string[];
}

interface AdminMediaDetailBaseProjection {
  id: string;
  kind: 'AUDIO';
  declaredMimeType: string;
  declaredSizeBytes: number;
  declaredSha256: string;
  createdAt: Date;
  usage: {
    pronunciations: AdminMediaUsageProjection;
    sentences: AdminMediaUsageProjection;
  };
}

/** storage key를 포함하지 않는 관리자 media 상세 projection */
export type AdminMediaDetailProjection =
  | (AdminMediaDetailBaseProjection & {
      status: 'READY';
      mimeType: string;
      sizeBytes: number;
      sha256: string;
      readyAt: Date;
    })
  | (AdminMediaDetailBaseProjection & {
      status: 'UPLOADING' | 'REJECTED';
      mimeType: null;
      sizeBytes: null;
      sha256: null;
      readyAt: null;
    });

/** READY metadata 손상을 안정적인 내부 오류로 전달한다 */
export class AdminMediaQueryError extends Error {
  readonly code = 'ADMIN_MEDIA_READY_METADATA_INVALID';

  constructor() {
    super('ADMIN_MEDIA_READY_METADATA_INVALID');
    this.name = 'AdminMediaQueryError';
  }
}

/** 공개 관리자 응답에 필요한 metadata와 사용 ID만 조립하는 query */
export class DrizzleAdminMediaQuery {
  constructor(private readonly database: AdminMediaDatabase) {}

  /** storageKey를 select하지 않고 발음·문장 version 사용처를 함께 반환한다 */
  async findById(
    mediaAssetId: string,
  ): Promise<AdminMediaDetailProjection | null> {
    const [row] = await this.database
      .select({
        id: mediaAssets.id,
        kind: mediaAssets.kind,
        declaredMimeType: mediaAssets.declaredMimeType,
        declaredSizeBytes: mediaAssets.declaredSizeBytes,
        declaredSha256: mediaAssets.declaredSha256,
        mimeType: mediaAssets.mimeType,
        sizeBytes: mediaAssets.sizeBytes,
        sha256: mediaAssets.sha256,
        status: mediaAssets.status,
        readyAt: mediaAssets.readyAt,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .limit(1);
    if (!row) return null;

    const pronunciationRows = await this.database
      .select({ id: vocabularyPronunciations.id })
      .from(vocabularyPronunciations)
      .where(eq(vocabularyPronunciations.mediaAssetId, mediaAssetId))
      .orderBy(asc(vocabularyPronunciations.id));
    const sentenceRows = await this.database
      .select({ id: thaiSentenceVersions.id })
      .from(thaiSentenceVersions)
      .where(eq(thaiSentenceVersions.mediaAssetId, mediaAssetId))
      .orderBy(asc(thaiSentenceVersions.id));
    const base: AdminMediaDetailBaseProjection = {
      id: row.id,
      kind: row.kind,
      declaredMimeType: row.declaredMimeType,
      declaredSizeBytes: row.declaredSizeBytes,
      declaredSha256: row.declaredSha256,
      createdAt: row.createdAt,
      usage: {
        pronunciations: {
          count: pronunciationRows.length,
          ids: pronunciationRows.map(({ id }) => id),
        },
        sentences: {
          count: sentenceRows.length,
          ids: sentenceRows.map(({ id }) => id),
        },
      },
    };
    if (row.status !== 'READY') {
      return {
        ...base,
        status: row.status,
        mimeType: null,
        sizeBytes: null,
        sha256: null,
        readyAt: null,
      };
    }
    if (
      row.mimeType === null ||
      row.sizeBytes === null ||
      row.sha256 === null ||
      row.readyAt === null
    ) {
      throw new AdminMediaQueryError();
    }
    return {
      ...base,
      status: 'READY',
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      readyAt: row.readyAt,
    };
  }
}
