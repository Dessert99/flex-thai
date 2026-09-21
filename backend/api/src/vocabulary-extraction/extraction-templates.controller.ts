/** 관리자 인증과 MFA를 거쳐 복사용 지시문을 관리한다 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  extractionTemplateInputSchema,
  extractionTemplateSchema,
  extractionTemplateListSchema,
} from '@flex-thia/contracts/vocabulary-extraction/extraction-templates';
import type { ExtractionTemplateRepository } from '@flex-thia/domain/vocabulary-extraction/extraction-template.repository';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';

export const EXTRACTION_TEMPLATE_REPOSITORY = Symbol(
  'EXTRACTION_TEMPLATE_REPOSITORY',
);
export class ExtractionTemplateInputDto extends createZodDto(
  extractionTemplateInputSchema,
) {}
export class ExtractionTemplateDto extends createZodDto(
  extractionTemplateSchema,
) {}
export class ExtractionTemplateListDto extends createZodDto(
  extractionTemplateListSchema,
) {}

@ApiTags('Admin Extraction Templates')
@ApiBearerAuth('accessToken')
@Controller('admin/vocabulary-extraction/templates')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class ExtractionTemplatesController {
  constructor(
    @Inject(EXTRACTION_TEMPLATE_REPOSITORY)
    private readonly repository: ExtractionTemplateRepository,
  ) {}
  @Get()
  @ApiOkResponse({ type: ExtractionTemplateListDto })
  async list() {
    const items = await this.repository.list();
    return extractionTemplateListSchema.parse({
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  }
  @Post()
  @ApiBody({ type: ExtractionTemplateInputDto })
  @ApiCreatedResponse({ type: ExtractionTemplateDto })
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = extractionTemplateInputSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException({ code: 'EXTRACTION_TEMPLATE_INVALID' });
    const item = await this.repository.create(input.data, user);
    return extractionTemplateSchema.parse({
      ...item,
      createdAt: item.createdAt.toISOString(),
    });
  }
  @Delete(':templateId')
  @HttpCode(204)
  @ApiNoContentResponse()
  async delete(
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const id = z.uuid().safeParse(templateId);
    if (!id.success)
      throw new BadRequestException({ code: 'EXTRACTION_TEMPLATE_ID_INVALID' });
    await this.repository.delete(id.data, user);
  }
}
