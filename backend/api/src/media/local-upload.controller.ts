/** local signed form upload을 provider token 검증으로만 수락한다 */
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  LocalFileUploadError,
  LocalFileUploadProvider,
} from '@flex-thia/providers';

type MultipartFile = {
  buffer: Buffer;
  mimetype?: string;
  size: number;
};

const maximumUploadBytes = 25 * 1024 * 1024;

/** production OpenAPI와 gateway에 등록하지 않는 local same-origin upload 경계 */
@ApiExcludeController()
@Controller('local-uploads')
export class LocalUploadController {
  constructor(private readonly storage: LocalFileUploadProvider) {}

  /** HMAC policy가 고정한 multipart file 하나만 private filesystem에 기록한다 */
  @Post(':token')
  @HttpCode(204)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: maximumUploadBytes },
    }),
  )
  async upload(
    @Param('token') token: string,
    @Body() fields: Record<string, unknown>,
    @UploadedFile() file: MultipartFile | undefined,
  ): Promise<void> {
    if (
      !file ||
      typeof fields.key !== 'string' ||
      typeof fields['Content-Type'] !== 'string'
    ) {
      throw new BadRequestException({ code: 'LOCAL_UPLOAD_INVALID' });
    }
    try {
      await this.storage.store({
        token,
        storageKey: fields.key,
        contentType: fields['Content-Type'],
        bytes: file.buffer,
        ...(file.mimetype ? { mimeType: file.mimetype } : {}),
      });
    } catch (error) {
      if (
        error instanceof LocalFileUploadError &&
        error.code === 'LOCAL_UPLOAD_NOT_FOUND'
      ) {
        throw new NotFoundException({ code: 'LOCAL_UPLOAD_NOT_FOUND' });
      }
      throw new BadRequestException({ code: 'LOCAL_UPLOAD_INVALID' });
    }
  }
}
