/** 콘텐츠 오류 신고 생성과 관리자 workflow를 조정한다 */
import {
  assertContentErrorReportTransition,
  ContentErrorReportDomainError,
  normalizeContentErrorReportDescription,
  type ContentErrorReportCategory,
  type ContentErrorReportOrigin,
  type ContentErrorReportStatus,
} from './content-error-report.js';
import type {
  ContentErrorReport,
  ContentErrorReportActor,
  ContentErrorReportAssigneeResolver,
  ContentErrorReportRepository,
  ContentErrorReportTargetResolver,
} from './content-error-report.repository.js';

/** 오류 신고 생성 입력 */
export interface CreateContentErrorReportInput {
  origin: ContentErrorReportOrigin;
  category: ContentErrorReportCategory;
  description?: string;
}

/** 콘텐츠를 변경하지 않고 신고 workflow만 수행한다 */
export class ContentErrorReportService {
  constructor(
    private readonly repository: ContentErrorReportRepository,
    private readonly targetResolver: ContentErrorReportTargetResolver,
    private readonly assigneeResolver: ContentErrorReportAssigneeResolver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 현재 사용자를 신고자로 고정해 새 신고를 생성한다 */
  async create(
    reporterUserId: string,
    input: CreateContentErrorReportInput,
  ): Promise<ContentErrorReport> {
    const target = await this.targetResolver.resolve(input.origin);
    if (!target)
      throw new ContentErrorReportDomainError(
        'CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE',
      );
    return this.repository.create({
      reporterUserId,
      category: input.category,
      description: normalizeContentErrorReportDescription(input.description),
      target,
      createdAt: this.now(),
    });
  }

  /** 허용된 상태만 optimistic concurrency 문맥과 함께 저장한다 */
  async changeStatus(
    actor: ContentErrorReportActor,
    report: ContentErrorReport,
    status: ContentErrorReportStatus,
  ): Promise<ContentErrorReport> {
    assertContentErrorReportTransition(report.status, status);
    return this.requireStored(
      await this.repository.changeStatus({
        reportId: report.id,
        fromStatus: report.status,
        toStatus: status,
        expectedUpdatedAt: report.updatedAt,
        actor,
        changedAt: this.now(),
      }),
    );
  }

  /** ACTIVE ADMIN을 담당자로 배정한다 */
  async assign(
    actor: ContentErrorReportActor,
    report: ContentErrorReport,
    assigneeUserId: string,
  ): Promise<ContentErrorReport> {
    if (
      report.assigneeUserId === assigneeUserId ||
      !(await this.assigneeResolver.isAssignable(assigneeUserId))
    ) {
      throw new ContentErrorReportDomainError(
        'CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE',
      );
    }
    return this.changeAssignee(actor, report, assigneeUserId);
  }

  /** 현재 담당자를 해제한다 */
  async unassign(
    actor: ContentErrorReportActor,
    report: ContentErrorReport,
  ): Promise<ContentErrorReport> {
    if (report.assigneeUserId === null) {
      throw new ContentErrorReportDomainError(
        'CONTENT_ERROR_REPORT_ASSIGNEE_UNAVAILABLE',
      );
    }
    return this.changeAssignee(actor, report, null);
  }

  private async changeAssignee(
    actor: ContentErrorReportActor,
    report: ContentErrorReport,
    assigneeUserId: string | null,
  ): Promise<ContentErrorReport> {
    return this.requireStored(
      await this.repository.changeAssignee({
        reportId: report.id,
        fromAssigneeUserId: report.assigneeUserId,
        toAssigneeUserId: assigneeUserId,
        expectedUpdatedAt: report.updatedAt,
        actor,
        changedAt: this.now(),
      }),
    );
  }

  private requireStored(report: ContentErrorReport | null): ContentErrorReport {
    if (!report)
      throw new ContentErrorReportDomainError(
        'CONTENT_ERROR_REPORT_CONCURRENT_UPDATE',
      );
    return report;
  }
}
