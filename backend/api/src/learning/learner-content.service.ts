/** 학습자 read/write 결과를 private key 없는 strict 공개 응답으로 조립한다 */

import {
  vocabularyDetailResponseSchema,
  vocabularyListResponseSchema,
  type VocabularyDetailResponse,
  type VocabularyListQuery,
  type VocabularyListResponse,
} from '@flex-thia/contracts/learning/vocabularies';

import {
  type DrizzleLearnerVocabularyQuery,
  type LearnerVocabularyListQuery,
  type LearnerVocabularySummaryProjection,
} from '@flex-thia/database/queries/drizzle-learner-vocabulary.query';

import { NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';

type VocabularyQuery = Pick<
  DrizzleLearnerVocabularyQuery,
  'getVocabularyDetail' | 'listVocabularies'
>;

interface LearnerContentDependencies {
  vocabularyQuery: VocabularyQuery;
}

/** 내부 응답 계약 실패의 Zod issue를 HTTP request 오류와 분리한다 */
export class LearnerPublicResponseError extends Error {
  constructor() {
    super('LEARNER_PUBLIC_RESPONSE_INVALID');
    this.name = 'LearnerPublicResponseError';
  }
}

/** 공개 응답 schema 실패를 내부 필드가 없는 generic 오류로 바꾼다 */
export const parseLearnerPublicResponse = <Output>(
  schema: ZodType<Output>,
  value: unknown,
): Output => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new LearnerPublicResponseError();
  }
  return result.data;
};

const toVocabularyListQuery = (
  query: VocabularyListQuery,
): LearnerVocabularyListQuery => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.query === undefined ? {} : { query: query.query }),
  ...(query.kind === undefined ? {} : { kind: query.kind }),
  ...(query.partOfSpeech === undefined
    ? {}
    : { partOfSpeech: query.partOfSpeech }),
  ...(query.difficulty === undefined ? {} : { difficulty: query.difficulty }),
});

const mapVocabularySummary = (
  vocabulary: LearnerVocabularySummaryProjection,
) => ({
  id: vocabulary.id,
  thai: vocabulary.thai,
  kind: vocabulary.kind,
  meanings: vocabulary.meanings,
  saved: vocabulary.saved,
});

export class LearnerContentService {
  constructor(private readonly dependencies: LearnerContentDependencies) {}

  /** 게시 어휘 목록의 모든 private media를 response-local URL로 바꾼다 */
  async listVocabularies(
    userId: string,
    query: VocabularyListQuery,
  ): Promise<VocabularyListResponse> {
    const result = await this.dependencies.vocabularyQuery.listVocabularies(
      userId,
      toVocabularyListQuery(query),
    );
    return parseLearnerPublicResponse(vocabularyListResponseSchema, {
      ...result,
      items: result.items.map((item) => mapVocabularySummary(item)),
    });
  }

  async getVocabularyDetail(
    userId: string,
    vocabularyId: string,
  ): Promise<VocabularyDetailResponse> {
    const detail = await this.dependencies.vocabularyQuery.getVocabularyDetail(
      userId,
      vocabularyId,
    );
    if (!detail) {
      throw new NotFoundException({ code: 'VOCABULARY_NOT_FOUND' });
    }
    return parseLearnerPublicResponse(vocabularyDetailResponseSchema, {
      ...mapVocabularySummary(detail),
      relations: detail.relations,
      exampleSentences: detail.exampleSentences,
    });
  }
}
