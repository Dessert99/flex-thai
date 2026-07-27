/** 문제 버전이 참조하는 모든 문장·발음 media의 게시 준비 상태를 조회한다 */
import type {
  ContentTtsMediaStatus,
  ContentTtsReadinessRepository,
  ContentTtsReadinessTarget,
} from '@flex-thia/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  expressionOccurrences,
  mediaAssets,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questionVersions,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularyPronunciations,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type ContentTtsReadinessDatabase = Pick<
  PgDatabase<PgQueryResultHKT, typeof schema>,
  'select'
>;

const toReadinessStatus = (
  mediaAssetId: string | null,
  status: 'UPLOADING' | 'READY' | 'REJECTED' | null,
): ContentTtsMediaStatus => {
  if (mediaAssetId === null || status === null) return 'MISSING';
  if (status === 'REJECTED') return 'FAILED';
  return status;
};

const compareTarget = (
  left: ContentTtsReadinessTarget,
  right: ContentTtsReadinessTarget,
): number =>
  left.targetId < right.targetId ? -1 : left.targetId > right.targetId ? 1 : 0;

/** 같은 PostgreSQL session에서 문제 게시용 TTS 준비 상태를 fail-closed로 조립한다 */
export class DrizzleContentTtsReadinessQuery implements ContentTtsReadinessRepository {
  constructor(private readonly database: ContentTtsReadinessDatabase) {}

  /** 블록·선택지 문장과 token·표현 발음의 READY 여부를 중복 없이 반환한다 */
  async listRequiredTargets(
    content: Parameters<
      ContentTtsReadinessRepository['listRequiredTargets']
    >[0],
  ): Promise<ContentTtsReadinessTarget[]> {
    const blockRows = await this.database
      .select({ sentenceVersionId: questionBlockSentences.sentenceVersionId })
      .from(questionBlockSentences)
      .innerJoin(
        questionBlocks,
        eq(questionBlockSentences.blockId, questionBlocks.id),
      )
      .innerJoin(
        questionVersions,
        eq(questionBlocks.questionVersionId, questionVersions.id),
      )
      .where(
        and(
          eq(questionVersions.questionId, content.questionId),
          eq(questionVersions.id, content.versionId),
        ),
      )
      .orderBy(asc(questionBlockSentences.sentenceVersionId));
    const optionRows = await this.database
      .select({
        sentenceVersionId: questionOptions.sentenceVersionId,
        spanSentenceVersionId: questionOptions.spanSentenceVersionId,
      })
      .from(questionOptions)
      .innerJoin(
        questionVersions,
        eq(questionOptions.questionVersionId, questionVersions.id),
      )
      .where(
        and(
          eq(questionVersions.questionId, content.questionId),
          eq(questionVersions.id, content.versionId),
        ),
      )
      .orderBy(asc(questionOptions.id));
    const sentenceVersionIds = [
      ...new Set([
        ...blockRows.map((row) => row.sentenceVersionId),
        ...optionRows.flatMap((row) => [
          ...(row.sentenceVersionId === null ? [] : [row.sentenceVersionId]),
          ...(row.spanSentenceVersionId === null
            ? []
            : [row.spanSentenceVersionId]),
        ]),
      ]),
    ];
    if (sentenceVersionIds.length === 0) return [];

    const sentenceRows = await this.database
      .select({
        targetId: thaiSentenceVersions.id,
        mediaAssetId: thaiSentenceVersions.mediaAssetId,
        mediaStatus: mediaAssets.status,
      })
      .from(thaiSentenceVersions)
      .leftJoin(
        mediaAssets,
        eq(thaiSentenceVersions.mediaAssetId, mediaAssets.id),
      )
      .where(inArray(thaiSentenceVersions.id, sentenceVersionIds))
      .orderBy(asc(thaiSentenceVersions.id));
    const tokenRows = await this.database
      .select({ pronunciationId: tokenOccurrences.pronunciationId })
      .from(tokenOccurrences)
      .where(inArray(tokenOccurrences.sentenceVersionId, sentenceVersionIds))
      .orderBy(asc(tokenOccurrences.pronunciationId));
    const expressionRows = await this.database
      .select({ pronunciationId: expressionOccurrences.pronunciationId })
      .from(expressionOccurrences)
      .where(
        inArray(expressionOccurrences.sentenceVersionId, sentenceVersionIds),
      )
      .orderBy(asc(expressionOccurrences.pronunciationId));
    const pronunciationIds = [
      ...new Set([
        ...tokenRows.map((row) => row.pronunciationId),
        ...expressionRows.map((row) => row.pronunciationId),
      ]),
    ];
    const pronunciationRows =
      pronunciationIds.length === 0
        ? []
        : await this.database
            .select({
              targetId: vocabularyPronunciations.id,
              mediaAssetId: vocabularyPronunciations.mediaAssetId,
              mediaStatus: mediaAssets.status,
            })
            .from(vocabularyPronunciations)
            .leftJoin(
              mediaAssets,
              eq(vocabularyPronunciations.mediaAssetId, mediaAssets.id),
            )
            .where(inArray(vocabularyPronunciations.id, pronunciationIds))
            .orderBy(asc(vocabularyPronunciations.id));

    const targets = new Map<string, ContentTtsReadinessTarget>();
    sentenceVersionIds.forEach((targetId) => {
      targets.set(`sentence:${targetId}`, {
        targetId,
        mediaStatus: 'MISSING',
      });
    });
    pronunciationIds.forEach((targetId) => {
      targets.set(`pronunciation:${targetId}`, {
        targetId,
        mediaStatus: 'MISSING',
      });
    });
    sentenceRows.forEach((row) => {
      targets.set(`sentence:${row.targetId}`, {
        targetId: row.targetId,
        mediaStatus: toReadinessStatus(row.mediaAssetId, row.mediaStatus),
      });
    });
    pronunciationRows.forEach((row) => {
      targets.set(`pronunciation:${row.targetId}`, {
        targetId: row.targetId,
        mediaStatus: toReadinessStatus(row.mediaAssetId, row.mediaStatus),
      });
    });
    return [...targets.values()].sort(compareTarget);
  }
}
