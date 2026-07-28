/** 콘텐츠 제작 runtime의 DB lookup·local 결정성·운영 fail-closed 조립을 검증한다 */
import { DrizzlePublishedQuestionSimilarityLookup } from '@flex-thia/database';
import { FakeContentInputReader } from '@flex-thia/providers';
import { describe, expect, it } from 'vitest';
import { UnavailableContentProductionProcessor } from './unavailable-content-production.processor.js';
import { createContentProductionRuntime } from './content-production-runtime.js';

describe('콘텐츠 제작 runtime', () => {
  it('local 모드는 기존 AI 어휘·문제 processor와 결정적 fake provider를 조립한다', () => {
    const runtime = createContentProductionRuntime({
      database: {} as never,
      mode: 'local',
      local: {
        inputReader: new FakeContentInputReader({}),
      },
    });

    expect(runtime.mode).toBe('local');
    expect(runtime.vocabularyProcessor?.constructor.name).toBe(
      'AiVocabularyProductionProcessor',
    );
    expect(runtime.questionProcessor?.constructor.name).toBe(
      'AiQuestionProductionProcessor',
    );
    expect(runtime.similarityLookup).toBeInstanceOf(
      DrizzlePublishedQuestionSimilarityLookup,
    );
    expect(runtime.processor).not.toBeInstanceOf(
      UnavailableContentProductionProcessor,
    );
  });

  it('production 모드는 provider 설정이 없어도 외부 adapter를 만들지 않고 unavailable 결과만 사용한다', () => {
    const runtime = createContentProductionRuntime({
      database: {} as never,
      mode: 'production',
    });

    expect(runtime.mode).toBe('production');
    expect(runtime.processor).toBeInstanceOf(
      UnavailableContentProductionProcessor,
    );
    expect(runtime.vocabularyProcessor).toBeNull();
    expect(runtime.questionProcessor).toBeNull();
  });
});
