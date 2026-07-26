/** 콘텐츠 오류 신고 Zod 계약을 Swagger DTO로 연결한다 */
import {
  adminContentErrorReportDetailResponseSchema,
  adminContentErrorReportListQuerySchema,
  adminContentErrorReportListResponseSchema,
  assignContentErrorReportRequestSchema,
  changeContentErrorReportStatusRequestSchema,
  contentErrorReportIdPathSchema,
  createContentErrorReportRequestSchema,
  createContentErrorReportResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 신고 생성 요청 DTO */
export class CreateContentErrorReportRequestDto extends createZodDto(
  createContentErrorReportRequestSchema,
) {}
/** 신고 생성 응답 DTO */
export class CreateContentErrorReportResponseDto extends createZodDto(
  createContentErrorReportResponseSchema,
) {}
/** 관리자 목록 query DTO */
export class AdminContentErrorReportListQueryDto extends createZodDto(
  adminContentErrorReportListQuerySchema,
) {}
/** 관리자 목록 응답 DTO */
export class AdminContentErrorReportListResponseDto extends createZodDto(
  adminContentErrorReportListResponseSchema,
) {}
/** 관리자 상세 응답 DTO */
export class AdminContentErrorReportDetailResponseDto extends createZodDto(
  adminContentErrorReportDetailResponseSchema,
) {}
/** 신고 path DTO */
export class ContentErrorReportIdPathDto extends createZodDto(
  contentErrorReportIdPathSchema,
) {}
/** 상태 변경 DTO */
export class ChangeContentErrorReportStatusRequestDto extends createZodDto(
  changeContentErrorReportStatusRequestSchema,
) {}
/** 담당자 배정 DTO */
export class AssignContentErrorReportRequestDto extends createZodDto(
  assignContentErrorReportRequestSchema,
) {}
