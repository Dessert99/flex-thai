/** TTS 성공 transaction 안에서 현재 DRAFT graph의 정확한 target에 READY media를 연결한다 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  mediaAssets,
  questionBlocks,
  questionBlockSentences,
  questionOptions,
  questionVersions,
  thaiSentenceVersions,
  tokenOccurrences,
  vocabularies,
  vocabularyPronunciations,
  expressionOccurrences,
} from '../../schema/index.js';
import type {
  TtsRepositoryTransaction,
  TtsTargetAttachmentWriter,
} from './drizzle-tts.repository.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const listQuestionSentenceIds = async (
  transaction: TtsRepositoryTransaction,
  questionVersionId: string,
): Promise<string[]> => {
  const blockRows = await transaction
    .select({ sentenceVersionId: questionBlockSentences.sentenceVersionId })
    .from(questionBlockSentences)
    .innerJoin(
      questionBlocks,
      eq(questionBlockSentences.blockId, questionBlocks.id),
    )
    .where(eq(questionBlocks.questionVersionId, questionVersionId));
  const optionRows = await transaction
    .select({
      sentenceVersionId: questionOptions.sentenceVersionId,
      spanSentenceVersionId: questionOptions.spanSentenceVersionId,
    })
    .from(questionOptions)
    .where(eq(questionOptions.questionVersionId, questionVersionId));
  return [
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
};

const isReadyMedia = async (
  transaction: TtsRepositoryTransaction,
  mediaAssetId: string,
): Promise<boolean> => {
  const [media] = await transaction
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.id, mediaAssetId), eq(mediaAssets.status, 'READY')),
    )
    .for('share')
    .limit(1);
  return media !== undefined;
};

const attachSentence = async (
  transaction: TtsRepositoryTransaction,
  input: Parameters<TtsTargetAttachmentWriter['attach']>[1],
  sentenceVersionIds: string[],
): Promise<'ATTACHED' | 'STALE_TARGET'> => {
  if (!sentenceVersionIds.includes(input.target.targetId)) {
    return 'STALE_TARGET';
  }
  const [sentence] = await transaction
    .select({
      id: thaiSentenceVersions.id,
      originalText: thaiSentenceVersions.originalText,
      mediaAssetId: thaiSentenceVersions.mediaAssetId,
      frozenAt: thaiSentenceVersions.frozenAt,
    })
    .from(thaiSentenceVersions)
    .where(eq(thaiSentenceVersions.id, input.target.targetId))
    .for('update')
    .limit(1);
  if (
    !sentence ||
    sentence.frozenAt !== null ||
    sentence.originalText !== input.target.text ||
    (sentence.mediaAssetId !== null &&
      sentence.mediaAssetId !== input.mediaAssetId)
  ) {
    return 'STALE_TARGET';
  }
  if (!(await isReadyMedia(transaction, input.mediaAssetId))) {
    return 'STALE_TARGET';
  }
  if (sentence.mediaAssetId === input.mediaAssetId) return 'ATTACHED';

  const [updated] = await transaction
    .update(thaiSentenceVersions)
    .set({ mediaAssetId: input.mediaAssetId })
    .where(
      and(
        eq(thaiSentenceVersions.id, input.target.targetId),
        isNull(thaiSentenceVersions.mediaAssetId),
        isNull(thaiSentenceVersions.frozenAt),
      ),
    )
    .returning({ id: thaiSentenceVersions.id });
  return updated ? 'ATTACHED' : 'STALE_TARGET';
};

const attachPronunciation = async (
  transaction: TtsRepositoryTransaction,
  input: Parameters<TtsTargetAttachmentWriter['attach']>[1],
  sentenceVersionIds: string[],
): Promise<'ATTACHED' | 'STALE_TARGET'> => {
  if (sentenceVersionIds.length === 0) return 'STALE_TARGET';
  const expectedKind =
    input.target.kind === 'EXPRESSION' ? 'EXPRESSION' : 'WORD';
  const occurrence =
    input.target.kind === 'EXPRESSION'
      ? expressionOccurrences
      : tokenOccurrences;
  const [pronunciation] = await transaction
    .select({
      id: vocabularyPronunciations.id,
      mediaAssetId: vocabularyPronunciations.mediaAssetId,
      thai: vocabularies.thai,
      vocabularyKind: vocabularies.kind,
    })
    .from(vocabularyPronunciations)
    .innerJoin(
      vocabularies,
      eq(vocabularyPronunciations.vocabularyId, vocabularies.id),
    )
    .innerJoin(
      occurrence,
      eq(vocabularyPronunciations.id, occurrence.pronunciationId),
    )
    .where(
      and(
        eq(vocabularyPronunciations.id, input.target.targetId),
        eq(vocabularies.kind, expectedKind),
        inArray(occurrence.sentenceVersionId, sentenceVersionIds),
      ),
    )
    .for('update', { of: vocabularyPronunciations })
    .limit(1);
  if (
    !pronunciation ||
    pronunciation.vocabularyKind !== expectedKind ||
    pronunciation.thai !== input.target.text ||
    (pronunciation.mediaAssetId !== null &&
      pronunciation.mediaAssetId !== input.mediaAssetId)
  ) {
    return 'STALE_TARGET';
  }
  if (!(await isReadyMedia(transaction, input.mediaAssetId))) {
    return 'STALE_TARGET';
  }
  if (pronunciation.mediaAssetId === input.mediaAssetId) return 'ATTACHED';

  const [updated] = await transaction
    .update(vocabularyPronunciations)
    .set({ mediaAssetId: input.mediaAssetId })
    .where(
      and(
        eq(vocabularyPronunciations.id, input.target.targetId),
        isNull(vocabularyPronunciations.mediaAssetId),
      ),
    )
    .returning({ id: vocabularyPronunciations.id });
  return updated ? 'ATTACHED' : 'STALE_TARGET';
};

/** 문제 버전 ID를 snapshot revision으로 사용해 게시와 target 연결을 같은 row lock으로 직렬화한다 */
export class DrizzleTtsTargetAttachmentWriter implements TtsTargetAttachmentWriter {
  /** 같은 transaction에서 DRAFT revision·참조·text·kind·READY media를 모두 재검증한다 */
  async attach(
    transaction: TtsRepositoryTransaction,
    input: Parameters<TtsTargetAttachmentWriter['attach']>[1],
  ): Promise<'ATTACHED' | 'STALE_TARGET'> {
    if (
      input.expectedRevision !== input.target.revision ||
      !uuidPattern.test(input.expectedRevision) ||
      !uuidPattern.test(input.target.targetId) ||
      !uuidPattern.test(input.mediaAssetId)
    ) {
      return 'STALE_TARGET';
    }
    const [version] = await transaction
      .select({
        id: questionVersions.id,
        questionId: questionVersions.questionId,
        status: questionVersions.status,
      })
      .from(questionVersions)
      .where(
        and(
          eq(questionVersions.id, input.expectedRevision),
          eq(questionVersions.status, 'DRAFT'),
        ),
      )
      .for('update')
      .limit(1);
    if (!version) return 'STALE_TARGET';

    const sentenceVersionIds = await listQuestionSentenceIds(
      transaction,
      version.id,
    );
    if (input.target.kind === 'THAI_SENTENCE_VERSION') {
      return attachSentence(transaction, input, sentenceVersionIds);
    }
    if (
      input.target.kind === 'VOCABULARY_PRONUNCIATION' ||
      input.target.kind === 'EXPRESSION'
    ) {
      return attachPronunciation(transaction, input, sentenceVersionIds);
    }
    return 'STALE_TARGET';
  }
}
