/** 게시 문제 문장 graph를 사용하는 결정적 유사도 조회를 검증한다 */
import type { GeneratedQuestionCandidate } from '@flex-thia/domain';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { DrizzlePublishedQuestionSimilarityLookup } from './drizzle-published-question-similarity.lookup.js';

const sentence = (originalText: string) =>
  ({
    originalText,
    translationKo: '',
    pronunciationKo: '',
    toneMarks: '',
    tokens: [],
    expressions: [],
  }) as never;

const candidate: GeneratedQuestionCandidate = {
  questionTypeVersionId: 'type-version-id',
  topicId: 'topic-id',
  tagIds: [],
  difficulty: 2,
  payload: {
    questionTypeSlug: 'reading-choice',
    questionTypeVersion: 1,
    difficulty: 2,
    topicSlug: 'general',
    tagSlugs: [],
    blocks: [
      {
        kind: 'QUESTION',
        displayMode: 'TEXT',
        sentences: [
          { speaker: null, sentence: sentence('  สวัสดี\u200B ครับ  ') },
        ],
      },
    ],
    options: [
      {
        clientRef: 'option-a',
        position: 0,
        sentence: sentence('ใช่'),
        span: null,
      },
    ],
    correctOptionRef: 'option-a',
  },
};

describe('게시 문제 유사도 조회', () => {
  it('현재 PUBLISHED 버전의 블록·선택지 문장을 정규화해 점수순으로 제한한다', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          questionVersionId: 'version-b',
          originalText: 'สวัสดี ครับ',
        },
        { questionVersionId: 'version-a', originalText: 'ใช่' },
        {
          questionVersionId: 'version-a',
          originalText: 'สวัสดี ครับ',
        },
        { questionVersionId: 'version-c', originalText: 'ไม่ใช่' },
      ],
    });
    const lookup = new DrizzlePublishedQuestionSimilarityLookup({
      execute,
    } as never);

    await expect(lookup.findSimilar(candidate, 5)).resolves.toEqual([
      {
        questionVersionId: 'version-a',
        score: 1,
        summary: 'สวัสดี ครับ | ใช่',
      },
      {
        questionVersionId: 'version-b',
        score: 0.5,
        summary: 'สวัสดี ครับ',
      },
    ]);

    const compiled = new PgDialect().sqlToQuery(
      execute.mock.calls[0]?.[0] as never,
    );
    expect(compiled.sql).toContain(
      '"questions"."current_published_version_id"',
    );
    expect(compiled.sql).toContain('"question_versions"."status" = $');
    expect(compiled.sql).toContain('"question_block_sentences"');
    expect(compiled.sql).toContain('"question_options"');
  });

  it('limit이 5가 아니면 호출 전에 거절한다', async () => {
    const execute = vi.fn();
    const lookup = new DrizzlePublishedQuestionSimilarityLookup({
      execute,
    } as never);

    await expect(lookup.findSimilar(candidate, 4 as 5)).rejects.toThrowError(
      'QUESTION_SIMILARITY_LIMIT_INVALID',
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
