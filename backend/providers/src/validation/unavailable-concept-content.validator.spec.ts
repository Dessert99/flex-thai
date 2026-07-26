/** 환경별 개념 외부 검증 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeConceptContentValidator } from '../fakes/fake-concept-content.validator.js';
import { UnavailableConceptContentValidator } from './unavailable-concept-content.validator.js';

describe('개념 외부 검증 adapter', () => {
  it('로컬에서는 결정적 검증 결과를 그대로 사용하도록 추가 문제를 만들지 않는다', async () => {
    await expect(
      new FakeConceptContentValidator().validate({} as never),
    ).resolves.toEqual([]);
  });

  it('운영에서는 외부 검증이 준비되지 않은 상태를 통과시키지 않는다', async () => {
    await expect(
      new UnavailableConceptContentValidator().validate({} as never),
    ).resolves.toEqual([
      {
        source: 'EXTERNAL',
        path: 'content',
        code: 'CONCEPT_EXTERNAL_VALIDATOR_UNAVAILABLE',
        evidenceKo: '외부 품질 검증기를 사용할 수 없습니다.',
      },
    ]);
  });
});
