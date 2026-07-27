/** taxonomy query와 domain command를 strict HTTP 응답으로 조립한다 */
import { createHash } from 'node:crypto';
import {
  questionTaxonomySettingsResponseSchema,
  type CreateQuestionTaxonomyTermRequest,
  type CreateQuestionTypeRequest,
  type CreateQuestionTypeVersionRequest,
  type QuestionTaxonomySettingsResponse,
  type QuestionTypeApprovedExampleRequest,
  type ReplaceDifficultyCriteriaRequest,
} from '@flex-thia/contracts';
import type { DrizzleQuestionTaxonomyQuery } from '@flex-thia/database';
import type { QuestionTaxonomyService } from '@flex-thia/domain';

type TaxonomyQuery = Pick<DrizzleQuestionTaxonomyQuery, 'findSettings'>;

/** 문제 분류 설정 facade 의존성 */
export interface QuestionTaxonomyFacadeDependencies {
  query: TaxonomyQuery;
  service: QuestionTaxonomyService;
}

/** 관리자 문제 분류 설정 HTTP facade */
export class QuestionTaxonomyFacade {
  constructor(
    private readonly dependencies: QuestionTaxonomyFacadeDependencies,
  ) {}

  /** 전체 설정을 공개 계약으로 검증해 반환한다 */
  async settings(): Promise<QuestionTaxonomySettingsResponse> {
    return questionTaxonomySettingsResponseSchema.parse(
      await this.dependencies.query.findSettings(),
    );
  }

  /** 논리 유형과 첫 DRAFT를 만든다 */
  createQuestionType(input: CreateQuestionTypeRequest): Promise<unknown> {
    return this.dependencies.service.createQuestionType(input);
  }

  /** 다음 DRAFT 버전을 만든다 */
  createVersion(
    questionTypeId: string,
    input: CreateQuestionTypeVersionRequest,
  ): Promise<unknown> {
    return this.dependencies.service.createNextDraft(questionTypeId, input);
  }

  /** DRAFT의 1~5 기준 전체를 교체한다 */
  replaceCriteria(
    versionId: string,
    input: ReplaceDifficultyCriteriaRequest,
  ): Promise<void> {
    return this.dependencies.service.replaceDifficultyCriteria(
      versionId,
      input.criteria,
    );
  }

  /** canonical snapshot의 결정적 hash를 계산해 승인 예시를 추가한다 */
  addExample(
    versionId: string,
    input: QuestionTypeApprovedExampleRequest,
  ): Promise<void> {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(input.payload))
      .digest('hex');
    return this.dependencies.service.addApprovedExample(versionId, {
      ...input,
      payloadHash,
    });
  }

  /** DRAFT의 승인 예시를 제거한다 */
  removeExample(versionId: string, exampleId: string): Promise<void> {
    return this.dependencies.service.removeApprovedExample(
      versionId,
      exampleId,
    );
  }

  /** 준비된 DRAFT를 ACTIVE로 전환한다 */
  activateVersion(versionId: string): Promise<void> {
    return this.dependencies.service.activateVersion(versionId);
  }

  /** ACTIVE를 RETIRED로 전환한다 */
  retireVersion(versionId: string): Promise<void> {
    return this.dependencies.service.retireVersion(versionId);
  }

  /** 주제 또는 태그를 만든다 */
  createTerm(
    kind: 'TOPIC' | 'TAG',
    input: CreateQuestionTaxonomyTermRequest,
  ): Promise<unknown> {
    return this.dependencies.service.createTerm(kind, input);
  }

  /** 주제 또는 태그를 보관 처리한다 */
  archiveTerm(kind: 'TOPIC' | 'TAG', termId: string): Promise<void> {
    return this.dependencies.service.archiveTerm(kind, termId);
  }
}
