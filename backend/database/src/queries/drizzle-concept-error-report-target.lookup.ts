/** 개념 학습 화면에 실제 공개된 오류 신고 대상을 canonical snapshot으로 해석한다 */
import type { ResolvedContentErrorReportTarget } from '@flex-thia/domain';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import type { ConceptErrorReportTargetLookup } from '../repositories/drizzle-content-error-report.repository.js';
import * as baseSchema from '../schema/index.js';
import {
  conceptBlockExamples,
  conceptBlocks,
  concepts,
  conceptVersions,
} from '../schema/concepts.schema.js';
import { mediaAssets } from '../schema/media.schema.js';
import {
  thaiSentenceVersions,
  tokenOccurrences,
} from '../schema/thai-content.schema.js';

type ConceptFeedbackDatabase = PgDatabase<PgQueryResultHKT, typeof baseSchema>;

interface PublishedConceptRow {
  conceptId: string;
  conceptVersionId: string;
  version: number;
  title: string;
  summary: string;
}

interface PublishedConceptSentenceRow {
  sentenceId: string;
  sentenceVersionId: string;
  version: number;
  originalText: string;
  translationKo: string;
  pronunciationKo: string;
  mediaAssetId: string;
}

/** 현재 게시된 개념 graph만 콘텐츠 오류 신고 target으로 공개한다 */
export class DrizzleConceptErrorReportTargetLookup implements ConceptErrorReportTargetLookup {
  constructor(private readonly database: ConceptFeedbackDatabase) {}

  /** current PUBLISHED 버전과 요청 block 관계를 검증해 개념 target을 만든다 */
  async resolve(
    origin: Parameters<ConceptErrorReportTargetLookup['resolve']>[0],
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const concept = await this.loadPublishedConcept(
      origin.conceptId,
      origin.conceptVersionId,
    );
    if (!concept) return null;

    if (origin.blockId === null) {
      return this.buildConceptTarget(concept, null);
    }

    const blocks = await this.database
      .select({
        id: conceptBlocks.id,
        heading: conceptBlocks.heading,
        position: conceptBlocks.position,
      })
      .from(conceptBlocks)
      .where(
        and(
          eq(conceptBlocks.id, origin.blockId),
          eq(conceptBlocks.conceptVersionId, origin.conceptVersionId),
        ),
      )
      .orderBy(asc(conceptBlocks.position), asc(conceptBlocks.id))
      .limit(1);
    const block = blocks[0];
    return block ? this.buildConceptTarget(concept, block) : null;
  }

  /** 공개 예시에 노출된 frozen 문장과 선택 token만 신고 target으로 만든다 */
  async resolveSentence(
    input: Parameters<ConceptErrorReportTargetLookup['resolveSentence']>[0],
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const sentence = await this.loadPublishedConceptSentence(
      input.sentenceVersionId,
    );
    if (!sentence) return null;

    if (input.tokenPosition !== null) {
      const tokens = await this.database
        .select({ id: tokenOccurrences.id })
        .from(tokenOccurrences)
        .where(
          and(
            eq(tokenOccurrences.sentenceVersionId, input.sentenceVersionId),
            eq(tokenOccurrences.position, input.tokenPosition),
          ),
        )
        .orderBy(asc(tokenOccurrences.position), asc(tokenOccurrences.id))
        .limit(1);
      if (!tokens[0]) return null;
    }

    return this.buildSentenceTarget(sentence, input.tokenPosition);
  }

  /** 공개 예시 문장의 READY media만 audio target으로 만든다 */
  async resolveSentenceAudio(
    sentenceVersionId: string,
  ): Promise<ResolvedContentErrorReportTarget | null> {
    const sentence = await this.loadPublishedConceptSentence(sentenceVersionId);
    if (!sentence) return null;
    return {
      reference: {
        kind: 'AUDIO',
        contentId: sentence.mediaAssetId,
        contentVersionId: sentence.sentenceVersionId,
        questionVersionId: null,
        sentenceVersionId: sentence.sentenceVersionId,
        mediaAssetId: sentence.mediaAssetId,
        locationId: null,
      },
      snapshot: {
        title: `${sentence.originalText} 음성`,
        primaryText: sentence.translationKo,
        secondaryText: sentence.pronunciationKo,
        versionLabel: `버전 ${sentence.version}`,
        locationLabel: '문장 음성',
        audioAssetId: sentence.mediaAssetId,
      },
    };
  }

  private async loadPublishedConcept(
    conceptId: string,
    conceptVersionId: string,
  ): Promise<PublishedConceptRow | null> {
    const rows = await this.database
      .select({
        conceptId: concepts.id,
        conceptVersionId: conceptVersions.id,
        version: conceptVersions.version,
        title: conceptVersions.title,
        summary: conceptVersions.summary,
      })
      .from(conceptVersions)
      .innerJoin(concepts, eq(concepts.id, conceptVersions.conceptId))
      .where(
        and(
          eq(concepts.id, conceptId),
          eq(concepts.status, 'PUBLISHED'),
          eq(concepts.currentPublishedVersionId, conceptVersionId),
          eq(conceptVersions.id, conceptVersionId),
          eq(conceptVersions.status, 'PUBLISHED'),
        ),
      )
      .orderBy(asc(conceptVersions.version), asc(conceptVersions.id))
      .limit(1);
    return rows[0] ?? null;
  }

  private async loadPublishedConceptSentence(
    sentenceVersionId: string,
  ): Promise<PublishedConceptSentenceRow | null> {
    const rows = await this.database
      .select({
        sentenceId: thaiSentenceVersions.sentenceId,
        sentenceVersionId: thaiSentenceVersions.id,
        version: thaiSentenceVersions.version,
        originalText: thaiSentenceVersions.originalText,
        translationKo: thaiSentenceVersions.translationKo,
        pronunciationKo: thaiSentenceVersions.pronunciationKo,
        mediaAssetId: mediaAssets.id,
      })
      .from(conceptBlockExamples)
      .innerJoin(
        conceptBlocks,
        eq(conceptBlocks.id, conceptBlockExamples.blockId),
      )
      .innerJoin(
        conceptVersions,
        eq(conceptVersions.id, conceptBlocks.conceptVersionId),
      )
      .innerJoin(
        concepts,
        and(
          eq(concepts.id, conceptVersions.conceptId),
          eq(concepts.currentPublishedVersionId, conceptVersions.id),
        ),
      )
      .innerJoin(
        thaiSentenceVersions,
        eq(thaiSentenceVersions.id, conceptBlockExamples.sentenceVersionId),
      )
      .innerJoin(
        mediaAssets,
        eq(mediaAssets.id, thaiSentenceVersions.mediaAssetId),
      )
      .where(
        and(
          eq(conceptBlockExamples.sentenceVersionId, sentenceVersionId),
          eq(conceptBlocks.kind, 'THAI_EXAMPLES'),
          eq(concepts.status, 'PUBLISHED'),
          eq(conceptVersions.status, 'PUBLISHED'),
          isNotNull(thaiSentenceVersions.frozenAt),
          eq(mediaAssets.status, 'READY'),
        ),
      )
      .orderBy(
        asc(conceptVersions.position),
        asc(concepts.id),
        asc(conceptBlocks.position),
        asc(conceptBlockExamples.position),
      )
      .limit(1);
    const row = rows[0];
    return row?.mediaAssetId ? row : null;
  }

  private buildConceptTarget(
    concept: PublishedConceptRow,
    block: { id: string; heading: string; position: number } | null,
  ): ResolvedContentErrorReportTarget {
    return {
      reference: {
        kind: 'CONCEPT',
        contentId: concept.conceptId,
        contentVersionId: concept.conceptVersionId,
        questionVersionId: null,
        sentenceVersionId: null,
        mediaAssetId: null,
        locationId: block?.id ?? null,
      },
      snapshot: {
        title: concept.title,
        primaryText: block?.heading ?? concept.summary,
        secondaryText: block ? concept.summary : null,
        versionLabel: `버전 ${concept.version}`,
        locationLabel: block ? `개념 블록 ${block.position + 1}` : '개념 상세',
        audioAssetId: null,
      },
    };
  }

  private buildSentenceTarget(
    sentence: PublishedConceptSentenceRow,
    tokenPosition: number | null,
  ): ResolvedContentErrorReportTarget {
    return {
      reference: {
        kind: 'SENTENCE',
        contentId: sentence.sentenceId,
        contentVersionId: sentence.sentenceVersionId,
        questionVersionId: null,
        sentenceVersionId: sentence.sentenceVersionId,
        mediaAssetId: sentence.mediaAssetId,
        locationId: null,
      },
      snapshot: {
        title: sentence.originalText,
        primaryText: sentence.translationKo,
        secondaryText: sentence.pronunciationKo,
        versionLabel: `버전 ${sentence.version}`,
        locationLabel:
          tokenPosition === null ? '문장' : `토큰 ${tokenPosition}`,
        audioAssetId: sentence.mediaAssetId,
      },
    };
  }
}
