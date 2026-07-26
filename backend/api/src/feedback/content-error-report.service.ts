/** 콘텐츠 오류 신고 domain 결과를 strict 공개 응답으로 변환한다 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  adminContentErrorReportDetailResponseSchema,
  adminContentErrorReportListResponseSchema,
  createContentErrorReportResponseSchema,
  type AdminContentErrorReportDetailResponse,
  type AdminContentErrorReportListQuery,
  type AdminContentErrorReportListResponse,
  type CreateContentErrorReportRequest,
  type CreateContentErrorReportResponse,
} from '@flex-thia/contracts';
import {
  ContentErrorReportDomainError,
  type ContentErrorReportActor,
  type ContentErrorReportQuery,
  type ContentErrorReportService,
  type ContentErrorReportStatus,
} from '@flex-thia/domain';

/** HTTP facade가 받는 domain use case와 read query */
export interface ContentErrorReportHttpDependencies {
  reports: ContentErrorReportService;
  query: ContentErrorReportQuery;
}

const mapSummary = (
  item: Awaited<ReturnType<ContentErrorReportQuery['list']>>['items'][number],
) => ({
  id: item.id,
  reporter: item.reporter,
  targetKind: item.targetKind,
  category: item.category,
  status: item.status,
  assignee: item.assignee,
  description: item.description,
  canonicalReference: item.canonicalReference,
  snapshot: item.snapshot,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

const mapContentErrorReportDomainError = (error: unknown): never => {
  if (!(error instanceof ContentErrorReportDomainError)) throw error;
  const response = { code: error.code };
  if (
    error.code === 'CONTENT_ERROR_REPORT_TARGET_UNAVAILABLE' ||
    error.code === 'CONTENT_ERROR_REPORT_NOT_FOUND'
  ) {
    throw new NotFoundException(response);
  }
  if (error.code === 'CONTENT_ERROR_REPORT_DESCRIPTION_INVALID') {
    throw new BadRequestException(response);
  }
  throw new ConflictException(response);
};

/** learner와 admin Controller가 공유하는 공개 facade */
export class ContentErrorReportHttpService {
  private readonly reports: ContentErrorReportService;
  private readonly query: ContentErrorReportQuery;

  constructor(dependencies: ContentErrorReportHttpDependencies);
  constructor(
    reports: ContentErrorReportService,
    query: ContentErrorReportQuery,
  );
  constructor(
    first: ContentErrorReportHttpDependencies | ContentErrorReportService,
    second?: ContentErrorReportQuery,
  ) {
    if ('reports' in first) {
      this.reports = first.reports;
      this.query = first.query;
    } else {
      this.reports = first;
      this.query = second as ContentErrorReportQuery;
    }
  }

  /** 현재 사용자를 신고자로 고정한다 */
  async create(
    reporterUserId: string,
    input: CreateContentErrorReportRequest,
  ): Promise<CreateContentErrorReportResponse> {
    try {
      const report = await this.reports.create(reporterUserId, {
        origin: input.origin,
        category: input.category,
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
      });
      return createContentErrorReportResponseSchema.parse({
        id: report.id,
        status: 'OPEN',
        createdAt: report.createdAt.toISOString(),
      });
    } catch (error) {
      return mapContentErrorReportDomainError(error);
    }
  }

  /** 관리자 필터 목록을 공개 page로 바꾼다 */
  async list(
    query: AdminContentErrorReportListQuery,
  ): Promise<AdminContentErrorReportListResponse> {
    const result = await this.query.list({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.targetKind === undefined
        ? {}
        : { targetKind: query.targetKind }),
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.assigneeUserId === undefined
        ? {}
        : { assigneeUserId: query.assigneeUserId }),
    });
    return adminContentErrorReportListResponseSchema.parse({
      items: result.items.map(mapSummary),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    });
  }

  /** immutable snapshot과 append-only 이력을 반환한다 */
  async detail(
    reportId: string,
  ): Promise<AdminContentErrorReportDetailResponse> {
    try {
      const detail = await this.requireDetail(reportId);
      return adminContentErrorReportDetailResponseSchema.parse({
        ...mapSummary({
          ...detail.report,
          reporter: detail.reporter,
          assignee: detail.assignee,
        }),
        history: detail.history.map((entry) => ({
          id: entry.id,
          action: entry.action,
          actor: { id: entry.actorUserId, email: entry.actorEmail },
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          fromAssigneeUserId: entry.fromAssigneeUserId,
          toAssigneeUserId: entry.toAssigneeUserId,
          createdAt: entry.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      return mapContentErrorReportDomainError(error);
    }
  }

  /** 관리자 상태 전이를 수행한다 */
  async changeStatus(
    actor: ContentErrorReportActor,
    reportId: string,
    status: ContentErrorReportStatus,
  ): Promise<AdminContentErrorReportDetailResponse> {
    try {
      const detail = await this.requireDetail(reportId);
      await this.reports.changeStatus(actor, detail.report, status);
      return this.detail(reportId);
    } catch (error) {
      return mapContentErrorReportDomainError(error);
    }
  }

  /** 관리자 담당자를 배정한다 */
  async assign(
    actor: ContentErrorReportActor,
    reportId: string,
    assigneeUserId: string,
  ) {
    try {
      const detail = await this.requireDetail(reportId);
      await this.reports.assign(actor, detail.report, assigneeUserId);
      return this.detail(reportId);
    } catch (error) {
      return mapContentErrorReportDomainError(error);
    }
  }

  /** 관리자 담당자를 해제한다 */
  async unassign(actor: ContentErrorReportActor, reportId: string) {
    try {
      const detail = await this.requireDetail(reportId);
      await this.reports.unassign(actor, detail.report);
      return this.detail(reportId);
    } catch (error) {
      return mapContentErrorReportDomainError(error);
    }
  }

  private async requireDetail(reportId: string) {
    const detail = await this.query.findById(reportId);
    if (!detail)
      throw new ContentErrorReportDomainError('CONTENT_ERROR_REPORT_NOT_FOUND');
    return detail;
  }
}
